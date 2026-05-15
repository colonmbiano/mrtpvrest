"use client";

export default function MobileRevenueBars() {
  const data = [
    { label: "Unlimited", value: "$4,200", percent: 85, color: "var(--orange)" },
    { label: "Pro", value: "$2,850", percent: 60, color: "var(--blue)" },
    { label: "Basic", value: "$940", percent: 25, color: "var(--text3)" },
  ];

  return (
    <div className="mobile-revenue-card md:hidden bg-surface border border-border rounded-xl p-4 mt-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Revenue por plan</h3>
      <div className="space-y-5">
        {data.map((item) => (
          <div key={item.label} className="space-y-1.5">
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-white/80">{item.label}</span>
              <span className="text-sm font-black text-white">{item.value}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000" 
                style={{ 
                  width: `${item.percent}%`, 
                  background: item.color,
                  boxShadow: `0 0 10px ${item.color}44`
                }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
