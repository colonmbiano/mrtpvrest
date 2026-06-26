import ModaOgImage from '../../_components/moda-og'
import { modaVerticals } from '../../_data/moda-verticals'

export { alt, size, contentType } from '../../_components/moda-og'

export function generateStaticParams() {
  return modaVerticals.map((v) => ({ giro: v.slug }))
}

export default function Image() {
  return ModaOgImage()
}
