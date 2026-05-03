import MeserosDetailClient from "./MeserosDetailClient";

export function generateStaticParams() {
  return [{ id: "_" }];
}

export const dynamicParams = true;

export default function Page({ params }: { params: { id: string } }) {
  return <MeserosDetailClient params={params} />;
}
