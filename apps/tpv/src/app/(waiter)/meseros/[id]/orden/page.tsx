import OrdenClient from "./OrdenClient";

export function generateStaticParams() {
  return [{ id: "_" }];
}

export const dynamicParams = true;

export default function Page({ params }: { params: { id: string } }) {
  return <OrdenClient params={params} />;
}
