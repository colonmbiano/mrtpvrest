'use client';

export function BentoTheme({ data }: { data: any }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-syne font-bold mb-4">Bento Theme</h1>
        <p className="text-gray-500">Próximamente... estamos puliendo los detalles premium.</p>
        <button onClick={() => window.location.reload()} className="mt-8 px-6 py-3 bg-black text-white rounded-full font-bold">
          Volver
        </button>
      </div>
    </div>
  );
}
