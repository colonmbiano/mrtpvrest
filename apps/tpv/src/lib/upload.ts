import api from "@/lib/api";

export async function uploadMenuImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const { data } = await api.post("/api/upload/image", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  if (!data?.url) throw new Error("Respuesta de upload sin url");
  return data.url;
}
