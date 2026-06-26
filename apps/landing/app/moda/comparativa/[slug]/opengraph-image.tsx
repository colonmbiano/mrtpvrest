import ModaOgImage from '../../../_components/moda-og'
import { modaComparisons } from '../../../_data/moda-comparisons'

export { alt, size, contentType } from '../../../_components/moda-og'

export function generateStaticParams() {
  return modaComparisons.map((c) => ({ slug: c.slug }))
}

export default function Image() {
  return ModaOgImage()
}
