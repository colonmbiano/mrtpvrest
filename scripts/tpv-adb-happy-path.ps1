param(
  [string]$DeviceId = "ADNKCP3324400995",
  [string]$PackageName = "com.mrtpvrest.tpv",
  [string]$EmployeePin = "",
  [ValidateSet("TAKEOUT", "DINE_IN", "DELIVERY")]
  [string]$OrderType = "TAKEOUT",
  [string]$CategoryText = "",
  [string]$ProductText = "",
  [string]$ArtifactsRoot = ".\artifacts\tpv-adb",
  [switch]$SkipLaunch,
  [switch]$SkipLogcat,
  [switch]$AutoApprove,
  [switch]$NonInteractive,
  [switch]$VerboseErrors,
  [switch]$ManualCatalog
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Adb {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  $stdoutPath = Join-Path $env:TEMP ("adb-out-" + [guid]::NewGuid().ToString("N") + ".log")
  $stderrPath = Join-Path $env:TEMP ("adb-err-" + [guid]::NewGuid().ToString("N") + ".log")
  try {
    $allArguments = @("-s", $script:DeviceId) + $Arguments
    $proc = Start-Process -FilePath "adb" `
      -ArgumentList $allArguments `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath
    $exitCode = $proc.ExitCode
    $stdout = if (Test-Path $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { "" }
    $stderr = if (Test-Path $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { "" }
    $output = ($stdout, $stderr | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join [Environment]::NewLine
  } finally {
    Remove-Item $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
  }

  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "adb $($Arguments -join ' ') failed with exit code $exitCode`n$output"
  }
  return $output
}

function Test-Tool {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function New-ArtifactPath {
  param([string]$Name)
  return Join-Path $script:RunDir $Name
}

function Get-FocusedApp {
  $raw = Invoke-Adb -Arguments @("shell", "dumpsys", "window")
  $focused = ($raw -split "`r?`n" | Where-Object {
    $_ -match "mCurrentFocus=" -or $_ -match "mFocusedApp="
  }) -join [Environment]::NewLine
  return $focused.Trim()
}

function Export-UiDump {
  param([string]$Label)

  $xmlRemote = "/sdcard/window_dump.xml"
  $xmlLocal = New-ArtifactPath "$Label.xml"
  Invoke-Adb -Arguments @("shell", "uiautomator", "dump", $xmlRemote) -AllowFailure | Out-Null
  Invoke-Adb -Arguments @("pull", $xmlRemote, $xmlLocal) -AllowFailure | Out-Null

  if (-not (Test-Path $xmlLocal)) {
    return $null
  }

  try {
    return [xml](Get-Content -LiteralPath $xmlLocal -Raw)
  } catch {
    return $null
  }
}

function Export-Screenshot {
  param([string]$Label)

  $path = New-ArtifactPath "$Label.png"
  $proc = Start-Process -FilePath "adb" `
    -ArgumentList @("-s", $script:DeviceId, "exec-out", "screencap", "-p") `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $path
  if ($proc.ExitCode -ne 0) {
    throw "No se pudo capturar screenshot para $Label."
  }
  return $path
}

function Get-VisibleTextSet {
  param($Xml)

  if ($null -eq $Xml) { return @() }

  $texts = New-Object System.Collections.Generic.List[string]
  foreach ($node in $Xml.SelectNodes("//node")) {
    foreach ($attr in @("text", "content-desc")) {
      $value = $node.GetAttribute($attr)
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $trimmed = $value.Trim()
        if (-not $texts.Contains($trimmed)) {
          [void]$texts.Add($trimmed)
        }
      }
    }
  }
  return $texts.ToArray()
}

function Get-StateFromTexts {
  param([string[]]$Texts)

  $joined = ($Texts -join " | ")
  if ($joined -match "Configuración Inicial|Seleccionar Sucursal|Vincular") { return "setup" }
  if ($joined -match "Ingresa tu PIN|Acceso|Validando") { return "locked" }
  if ($joined -match "Comer Aquí|Para Llevar|Delivery|Abrir turno|Tickets") { return "hub" }
  if ($joined -match "Buscar producto|Favoritos|Cobrar Ticket|Ticket vacío|Procesar pago") { return "menu" }
  if ($joined -match "Procesar pago|Confirmar pago|Esperando terminal") { return "payment" }
  if ($joined -match "Cobro procesado|Pago aprobado") { return "payment-success" }
  return "unknown"
}

function Save-Snapshot {
  param([string]$Label)

  $screenshot = Export-Screenshot -Label $Label
  $xml = Export-UiDump -Label $Label
  $texts = Get-VisibleTextSet -Xml $xml
  $state = Get-StateFromTexts -Texts $texts
  $focus = Get-FocusedApp

  $meta = [ordered]@{
    label = $Label
    capturedAt = (Get-Date).ToString("s")
    focusedApp = $focus
    state = $state
    screenshot = $screenshot
    visibleTexts = $texts
  }

  $jsonPath = New-ArtifactPath "$Label.json"
  $meta | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

  return [pscustomobject]$meta
}

function Wait-ForVisiblePattern {
  param(
    [string[]]$Patterns,
    [string]$Label,
    [int]$TimeoutSec = 12
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $xml = Export-UiDump -Label $Label
    $match = Get-NodeCenterByPattern -Xml $xml -Patterns $Patterns
    if ($null -ne $match) {
      return $true
    }
    Start-Sleep -Milliseconds 800
  } while ((Get-Date) -lt $deadline)

  return $false
}

function Read-YesNo {
  param(
    [string]$Prompt,
    [bool]$DefaultYes = $false
  )

  if ($AutoApprove -or $NonInteractive) {
    Write-Host "$Prompt [auto-yes]" -ForegroundColor DarkYellow
    return $true
  }

  $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
  $answer = Read-Host "$Prompt $suffix"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
  return $answer.Trim().ToLowerInvariant().StartsWith("y")
}

function Wait-ForOperator {
  param([string]$Prompt)
  if ($NonInteractive -and -not $ManualCatalog) {
    Write-Host "$Prompt [non-interactive continue]" -ForegroundColor DarkYellow
    return
  }
  [void](Read-Host $Prompt)
}

function Normalize-UiText {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }

  $normalized = $Value.ToLowerInvariant()
  $normalized = $normalized `
    -replace "Ã¡", "a" `
    -replace "Ã©", "e" `
    -replace "Ã­", "i" `
    -replace "Ã³", "o" `
    -replace "Ãº", "u" `
    -replace "Ã±", "n" `
    -replace "Â", ""
  $normalized = $normalized.Normalize([Text.NormalizationForm]::FormD)
  $chars = foreach ($ch in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      $ch
    }
  }
  return (-join $chars)
}

function Get-NodeCenterByPattern {
  param(
    $Xml,
    [string[]]$Patterns,
    [switch]$ExactText
  )

  if ($null -eq $Xml) { return $null }

  foreach ($node in $Xml.SelectNodes("//node")) {
    $candidates = @($node.GetAttribute("text"), $node.GetAttribute("content-desc"))
    $bounds = $node.GetAttribute("bounds")
    if ([string]::IsNullOrWhiteSpace($bounds)) { continue }

    foreach ($value in $candidates) {
      if ([string]::IsNullOrWhiteSpace($value)) { continue }
      foreach ($pattern in $Patterns) {
        $matched = if ($ExactText) {
          (Normalize-UiText $value) -eq (Normalize-UiText $pattern)
        } else {
          $value -match $pattern
        }
        if ($matched) {
          $boundMatch = [regex]::Match($bounds, "\[(\d+),(\d+)\]\[(\d+),(\d+)\]")
          if ($boundMatch.Success) {
            $x = [int](([int]$boundMatch.Groups[1].Value + [int]$boundMatch.Groups[3].Value) / 2)
            $y = [int](([int]$boundMatch.Groups[2].Value + [int]$boundMatch.Groups[4].Value) / 2)
            return [pscustomobject]@{
              Text = $value
              X = $x
              Y = $y
            }
          }
        }
      }
    }
  }
  return $null
}

function Invoke-TapByPattern {
  param(
    [string[]]$Patterns,
    [string]$Description,
    [switch]$ExactText,
    [int]$WaitAfterTapMs = 2000
  )

  $safe = $Description -replace "[^a-zA-Z0-9\-]", "-"
  Save-Snapshot -Label ("tap-scan-" + $safe) | Out-Null
  $target = Get-NodeCenterByPattern -Xml (Export-UiDump -Label ("tap-target-" + $safe)) -Patterns $Patterns -ExactText:$ExactText
  if ($null -eq $target) {
    throw "No encontré un nodo visible para '$Description'. Revisa los artifacts y continúa manualmente."
  }

  Invoke-Adb -Arguments @("shell", "input", "tap", "$($target.X)", "$($target.Y)") | Out-Null
  Start-Sleep -Milliseconds $WaitAfterTapMs
  Write-Host ("Tap: {0} -> '{1}' ({2},{3})" -f $Description, $target.Text, $target.X, $target.Y) -ForegroundColor DarkGray
}

function Invoke-PinEntry {
  param([string]$Pin)

  foreach ($digit in $Pin.ToCharArray()) {
    Invoke-TapByPattern -Patterns @("^$digit$") -Description "PIN-$digit"
  }
}

function Get-AppVersionInfo {
  $pkg = Invoke-Adb -Arguments @("shell", "dumpsys", "package", $script:PackageName)
  $versionName = ([regex]::Match($pkg, "versionName=([^\s]+)")).Groups[1].Value
  $versionCode = ([regex]::Match($pkg, "versionCode=(\d+)")).Groups[1].Value
  return [pscustomobject]@{
    versionName = $versionName
    versionCode = $versionCode
  }
}

function Start-LogcatCapture {
  if ($SkipLogcat) { return $null }
  $logPath = New-ArtifactPath "device.log"
  $cmd = "adb -s $DeviceId logcat -v time > `"$logPath`""
  return Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-Command", $cmd -WindowStyle Hidden -PassThru
}

function Stop-LogcatCapture {
  param($Process)
  if ($null -ne $Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force
  }
}

function Write-RunSummary {
  param(
    [pscustomobject]$Precheck,
    [System.Collections.Generic.List[object]]$Snapshots,
    [string]$Outcome
  )

  $summaryPath = New-ArtifactPath "README.md"
  $lines = New-Object System.Collections.Generic.List[string]
  [void]$lines.Add("# TPV ADB Happy Path Run")
  [void]$lines.Add("")
  [void]$lines.Add("- DeviceId: $DeviceId")
  [void]$lines.Add("- PackageName: $PackageName")
  [void]$lines.Add("- Started: $($script:StartedAt.ToString("s"))")
  [void]$lines.Add("- Order Type: $OrderType")
  [void]$lines.Add("- Product Text: $(if ($ProductText) { $ProductText } else { '(manual selection)' })")
  [void]$lines.Add("- Outcome: $Outcome")
  [void]$lines.Add("")
  [void]$lines.Add("## Precheck")
  [void]$lines.Add("")
  [void]$lines.Add("- Version: $($Precheck.versionName) ($($Precheck.versionCode))")
  [void]$lines.Add("- Focus: $($Precheck.focusedApp)")
  [void]$lines.Add("- Initial State: $($Precheck.state)")
  [void]$lines.Add("- Note: el script no puede inspeccionar de forma segura si /setup guardó un override de apiBaseUrl; solo documenta la UI visible y la configuración bakeada del paquete.")
  [void]$lines.Add("")
  [void]$lines.Add("## Snapshots")
  [void]$lines.Add("")
  foreach ($snapshot in $Snapshots) {
    [void]$lines.Add("- $(Split-Path $snapshot.screenshot -Leaf) | state=$($snapshot.state) | focus=$($snapshot.focusedApp)")
  }
  [void]$lines.Add("")
  [void]$lines.Add("## Manual Checks")
  [void]$lines.Add("")
  [void]$lines.Add("- Confirmar sucursal visible y terminal correcta antes de cobrar.")
  [void]$lines.Add("- Confirmar producto y monto antes de enviar a terminal real.")
  [void]$lines.Add("- Confirmar retorno al TPV y mensaje final después del cobro.")
  Set-Content -LiteralPath $summaryPath -Value $lines -Encoding UTF8
}

if (-not (Test-Tool -Name "adb")) {
  throw "adb no está disponible en PATH."
}

$script:StartedAt = Get-Date
$script:DeviceId = $DeviceId
$script:PackageName = $PackageName
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$script:RunDir = Join-Path $ArtifactsRoot $timestamp
New-Item -ItemType Directory -Path $script:RunDir -Force | Out-Null

$snapshots = New-Object "System.Collections.Generic.List[object]"
$logcatProcess = $null
$outcome = "incomplete"

try {
  Write-Step "Verificando dispositivo y paquete"
  $devices = (& adb devices) -join "`n"
  if ($devices -notmatch [regex]::Escape($DeviceId)) {
    throw "El dispositivo $DeviceId no aparece en 'adb devices'."
  }
  $pkgList = Invoke-Adb -Arguments @("shell", "pm", "list", "packages", $PackageName)
  if ($pkgList -notmatch [regex]::Escape($PackageName)) {
    throw "El paquete $PackageName no está instalado en $DeviceId."
  }

  $version = Get-AppVersionInfo
  $logcatProcess = Start-LogcatCapture

  if (-not $SkipLaunch) {
    Write-Step "Abriendo la app"
    Invoke-Adb -Arguments @("shell", "monkey", "-p", $PackageName, "-c", "android.intent.category.LAUNCHER", "1") | Out-Null
    Start-Sleep -Seconds 3
  }

  $initial = Save-Snapshot -Label "00-initial"
  $snapshots.Add($initial) | Out-Null

  $precheck = [pscustomobject]@{
    versionName = $version.versionName
    versionCode = $version.versionCode
    state = $initial.state
    focusedApp = $initial.focusedApp
  }

  Write-Host "Estado inicial detectado: $($initial.state)" -ForegroundColor Yellow
  if ($initial.state -eq "setup") {
    throw "La app cayó en /setup. Este runner no cambia la vinculación del dispositivo en producción."
  }

  if (-not (Read-YesNo -Prompt "¿Confirmas que la sucursal y la terminal visibles son correctas antes de seguir?")) {
    throw "Operación cancelada por el operador antes del login."
  }

  if ($initial.state -eq "locked") {
    Write-Step "Ingreso al TPV"
    if ($EmployeePin) {
      Invoke-PinEntry -Pin $EmployeePin
    } else {
      Wait-ForOperator -Prompt "Ingresa el PIN manualmente en la tablet y presiona Enter aquí cuando llegues al Hub."
    }
  } elseif ($initial.state -ne "hub" -and $initial.state -ne "menu") {
    Wait-ForOperator -Prompt "Navega la tablet hasta el Hub o menú principal y presiona Enter para continuar."
  }

  $afterLogin = Save-Snapshot -Label "01-after-login"
  $snapshots.Add($afterLogin) | Out-Null

  if ($afterLogin.state -eq "hub") {
    Write-Step "Selección de tipo de orden"
    switch ($OrderType) {
      "TAKEOUT" { Invoke-TapByPattern -Patterns @("Para Llevar", "^Llevar$") -Description "order-type-takeout" }
      "DINE_IN" { Invoke-TapByPattern -Patterns @("Comer Aquí") -Description "order-type-dinein" }
      "DELIVERY" { Invoke-TapByPattern -Patterns @("^Delivery$") -Description "order-type-delivery" }
    }
  }

  if ($OrderType -eq "DINE_IN") {
    Wait-ForOperator -Prompt "Selecciona la mesa y los comensales en la tablet, luego presiona Enter cuando el catálogo esté visible."
  }

  $menuState = Save-Snapshot -Label "02-menu-ready"
  $snapshots.Add($menuState) | Out-Null

  if ($ManualCatalog) {
    Write-Step "Selección manual de catálogo"
    Wait-ForOperator -Prompt "Selecciona manualmente la categoría y el producto en la tablet, y presiona Enter aquí cuando el ticket ya tenga el artículo."
  } elseif ($CategoryText) {
    Write-Step "Selección de categoría"
    $categoryStem = if ($CategoryText.Length -ge 3) { $CategoryText.Substring(0, 3) } else { $CategoryText }
    [void](Wait-ForVisiblePattern -Patterns @("Ver productos de $categoryStem") -Label "wait-category-list")
    Invoke-TapByPattern -Patterns @("Ver productos de $categoryStem") -Description "category-selection"
    $afterCategory = Save-Snapshot -Label "02b-category-ready"
    $snapshots.Add($afterCategory) | Out-Null
    Write-Step "Selección de producto"
    if ($ProductText) {
      $productStem = ($ProductText -split "\s+")[0]
      [void](Wait-ForVisiblePattern -Patterns @($productStem) -Label "wait-product-list")
      Invoke-TapByPattern -Patterns @($productStem) -Description "product-selection"
    } else {
      Write-Host "Textos visibles en pantalla:" -ForegroundColor DarkYellow
      $menuState.visibleTexts | Select-Object -First 40 | ForEach-Object { Write-Host " - $_" }
      Wait-ForOperator -Prompt "Selecciona manualmente un producto de prueba de bajo impacto y presiona Enter cuando aparezca en el ticket."
    }
  }

  $beforePayment = Save-Snapshot -Label "03-before-payment"
  $snapshots.Add($beforePayment) | Out-Null

  Write-Step "Apertura de cobro"
  Invoke-TapByPattern -Patterns @("Cobrar Ticket", "^Cobrar$") -Description "open-payment"
  $paymentModal = Save-Snapshot -Label "04-payment-modal"
  $snapshots.Add($paymentModal) | Out-Null

  Invoke-TapByPattern -Patterns @("^Tarjeta$") -Description "payment-method-card"
  $beforeCharge = Save-Snapshot -Label "05-before-charge"
  $snapshots.Add($beforeCharge) | Out-Null

  if (-not (Read-YesNo -Prompt "¿Confirmas que el producto y el monto visibles son correctos antes de disparar la terminal real?")) {
    throw "Cobro cancelado por el operador antes de confirmar pago."
  }

  Invoke-TapByPattern -Patterns @("Confirmar pago", "^Pagar$") -Description "confirm-payment"
  Start-Sleep -Seconds 2
  $afterConfirm = Save-Snapshot -Label "06-after-confirm"
  $snapshots.Add($afterConfirm) | Out-Null

  Wait-ForOperator -Prompt "Completa el flujo físico en la terminal real y presiona Enter cuando el TPV haya regresado al estado final."
  $final = Save-Snapshot -Label "07-final"
  $snapshots.Add($final) | Out-Null

  $outcome = "completed"
  Write-RunSummary -Precheck $precheck -Snapshots $snapshots -Outcome $outcome
  Write-Host ""
  Write-Host "Run completado. Artifacts en: $script:RunDir" -ForegroundColor Green
} catch {
  $outcome = "failed"
  Write-Host ""
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  if ($VerboseErrors) {
    Write-Host ($_ | Format-List * -Force | Out-String) -ForegroundColor DarkRed
  }
  if (-not (Test-Path (New-ArtifactPath "README.md"))) {
    $fallbackPrecheck = [pscustomobject]@{
      versionName = ""
      versionCode = ""
      state = ""
      focusedApp = ""
    }
    Write-RunSummary -Precheck $fallbackPrecheck -Snapshots $snapshots -Outcome $outcome
  }
  exit 1
} finally {
  Stop-LogcatCapture -Process $logcatProcess
}
