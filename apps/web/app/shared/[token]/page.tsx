import { notFound } from "next/navigation"
import { getSharedList } from "@/lib/queries/shopping-list"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Separator } from "@workspace/ui/components/separator"
import { Eye, ShoppingCart } from "lucide-react"

const formatNOK = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

const priorityLabel: Record<string, { label: string; className: string }> = {
  HIGH: { label: "Høy", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  LOW: { label: "Lav", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
}

const phaseLabel: Record<string, string> = {
  BEFORE_MOVE: "Før innflytting",
  FIRST_WEEK: "Første uke",
  CAN_WAIT: "Kan vente",
  NO_RUSH: "Ingen hast",
}

export default async function SharedListPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const list = await getSharedList(token)

  if (!list) {
    notFound()
  }

  const pendingItems = list.items.filter((i) => i.status === "PENDING")
  const purchasedItems = list.items.filter((i) => i.status === "PURCHASED")
  const totalEstimated = list.items.reduce(
    (sum, i) => sum + (i.estimatedPrice ? Number(i.estimatedPrice) : 0),
    0
  )

  return (
    <div className="min-h-svh bg-gradient-to-b from-accent/30 to-background">
      <div className="mx-auto max-w-3xl p-4 py-8 md:p-8">
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" />
          <span>Delt visning — kun lesetilgang</span>
        </div>

        <div className="mb-8">
          <p className="text-muted-foreground text-sm">
            {list.household.name}
          </p>
          <h1 className="font-heading text-3xl">{list.name}</h1>
          <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
            <span>{list.items.length} ting totalt</span>
            <span>{pendingItems.length} gjenstående</span>
            {totalEstimated > 0 && (
              <span>Estimert: {formatNOK(totalEstimated)}</span>
            )}
          </div>
        </div>

        {pendingItems.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold">
              Gjenstående ({pendingItems.length})
            </h2>
            <div className="space-y-3">
              {pendingItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-start justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.priority && (
                          <Badge
                            variant="outline"
                            className={priorityLabel[item.priority]?.className}
                          >
                            {priorityLabel[item.priority]?.label}
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-muted-foreground text-sm">
                          {item.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.category && (
                          <Badge variant="secondary">{item.category.name}</Badge>
                        )}
                        {item.phase && (
                          <span>{phaseLabel[item.phase]}</span>
                        )}
                        {item.storeName && <span>{item.storeName}</span>}
                        {item.assignedTo && (
                          <span>{item.assignedTo.name}</span>
                        )}
                      </div>
                    </div>
                    {item.estimatedPrice && (
                      <span className="text-sm font-medium whitespace-nowrap">
                        {formatNOK(Number(item.estimatedPrice))}
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {purchasedItems.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-muted-foreground">
              Kjøpt ({purchasedItems.length})
            </h2>
            <div className="space-y-2">
              {purchasedItems.map((item) => (
                <Card key={item.id} className="opacity-60">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-green-600" />
                      <span className="text-sm line-through">{item.name}</span>
                      {item.category && (
                        <Badge variant="secondary" className="text-xs">
                          {item.category.name}
                        </Badge>
                      )}
                    </div>
                    {item.estimatedPrice && (
                      <span className="text-sm text-muted-foreground">
                        {formatNOK(Number(item.estimatedPrice))}
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {list.items.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Denne listen er tom</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
