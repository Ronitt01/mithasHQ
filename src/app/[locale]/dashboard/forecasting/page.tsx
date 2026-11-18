import { auth } from "@/lib/auth";
import { prisma } from "@/db/prisma";
import { redirect } from "next/navigation";
import { startOfDay, subDays } from "date-fns";

const HISTORY_DAYS = 28;
const HORIZON_DAYS = 7;

export default async function ForecastingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) {
    redirect(`/${locale}/login`);
  }
  const tenantId = session.user.tenantId;
  const since = startOfDay(subDays(new Date(), HISTORY_DAYS));

  const [products, counterSales, delivered, stock] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, isActive: true, sellingPrice: { gt: 0 } },
      orderBy: { name: "asc" },
    }),
    prisma.stockLog.groupBy({
      by: ["productId"],
      where: { tenantId, type: "STOCK_OUT", date: { gte: since } },
      _sum: { quantity: true },
    }),
    prisma.deliveryItem.groupBy({
      by: ["productId"],
      where: { delivery: { tenantId, status: { not: "CANCELLED" }, date: { gte: since } } },
      _sum: { quantity: true },
    }),
    prisma.inventory.groupBy({
      by: ["productId"],
      where: { tenantId },
      _sum: { quantity: true },
    }),
  ]);

  const sumFor = (rows: { productId: string; _sum: { quantity: { toNumber(): number } | null } }[], id: string) =>
    rows.find((r) => r.productId === id)?._sum.quantity?.toNumber() ?? 0;

  const rows = products
    .map((p) => {
      const avgDaily = (sumFor(counterSales, p.id) + sumFor(delivered, p.id)) / HISTORY_DAYS;
      const inStock = sumFor(stock, p.id);
      const forecast = avgDaily * HORIZON_DAYS;
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        avgDaily,
        forecast,
        inStock,
        daysCover: avgDaily > 0 ? inStock / avgDaily : null,
        toPrepare: Math.max(0, Math.ceil(forecast - inStock)),
      };
    })
    .filter((r) => r.avgDaily > 0);

  const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">Demand Forecasting</h1>
        <p className="text-gray-600">
          Next {HORIZON_DAYS} days, projected from average daily demand (counter sales + B2B deliveries)
          over the last {HISTORY_DAYS} days.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-500">
            Not enough sales history yet. Record stock-outs or deliveries to see a forecast.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Avg / day</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Next {HORIZON_DAYS} days</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">In stock</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Days of cover</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">To prepare</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const short = r.daysCover !== null && r.daysCover < HORIZON_DAYS;
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1A1A2E]">{r.name}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(r.avgDaily)} {r.unit}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-[#1A1A2E]">{fmt(r.forecast)} {r.unit}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(r.inStock)} {r.unit}</td>
                      <td className="px-4 py-3 text-right text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${short ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                          {r.daysCover === null ? "—" : `${fmt(r.daysCover)} days`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-[#1A1A2E]">
                        {r.toPrepare > 0 ? `${r.toPrepare} ${r.unit}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
