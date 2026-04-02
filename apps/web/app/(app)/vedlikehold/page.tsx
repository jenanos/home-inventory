import { requireHousehold } from "@/lib/session"
import { getMaintenanceTasks } from "@/lib/queries/maintenance"
import { Wrench, AlertTriangle, Clock, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { CreateTaskDialog } from "./create-task-dialog"

const priorityConfig = {
  HIGH: { label: "Høy", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  LOW: { label: "Lav", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
}

const statusConfig = {
  NOT_STARTED: { label: "Ikke startet", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
  IN_PROGRESS: { label: "Pågår", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  COMPLETED: { label: "Fullført", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  ON_HOLD: { label: "På vent", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" },
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount)

export default async function VedlikeholdPage() {
  const { membership } = await requireHousehold()
  const tasks = await getMaintenanceTasks(membership.householdId)

  const totalEstimate = tasks.reduce(
    (sum, task) => sum + (task.estimatedPrice ? Number(task.estimatedPrice) : 0),
    0
  )

  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS").length
  const notStartedCount = tasks.filter((t) => t.status === "NOT_STARTED").length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Vedlikehold
          </h1>
          <p className="text-muted-foreground text-sm">
            Oversikt over vedlikeholdsoppgaver for boligen
          </p>
        </div>
        <CreateTaskDialog />
      </div>

      {tasks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totalt estimert</CardTitle>
              <Wrench className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {totalEstimate > 0 ? formatCurrency(totalEstimate) : "—"}
              </div>
              <p className="text-muted-foreground text-xs">
                {tasks.length} {tasks.length === 1 ? "oppgave" : "oppgaver"} totalt
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ikke startet</CardTitle>
              <AlertTriangle className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{notStartedCount}</div>
              <p className="text-muted-foreground text-xs">
                Oppgaver som venter
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pågår</CardTitle>
              <Clock className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{inProgressCount}</div>
              <p className="text-muted-foreground text-xs">
                Under arbeid
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fullført</CardTitle>
              <CheckCircle2 className="text-muted-foreground h-4 w-4" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedCount}</div>
              {tasks.length > 0 && (
                <Progress
                  value={(completedCount / tasks.length) * 100}
                  className="mt-2"
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tasks.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12">
          <Wrench className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="font-heading text-lg font-medium">
            Ingen vedlikeholdsoppgaver ennå
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Legg til din første oppgave for å komme i gang
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => {
            const totalEntries = task.progressEntries.length
            const completedEntries = task.progressEntries.filter(
              (e) => e.completed
            ).length
            const progressPercent =
              totalEntries > 0
                ? Math.round((completedEntries / totalEntries) * 100)
                : 0
            const selectedVendor = task.vendors.find((v) => v.isSelected)

            return (
              <Link key={task.id} href={`/vedlikehold/${task.id}`}>
                <Card className="transition-colors hover:bg-muted/50 h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">
                        {task.title}
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className={statusConfig[task.status].className}
                      >
                        {statusConfig[task.status].label}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {task.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={priorityConfig[task.priority].className}
                      >
                        {priorityConfig[task.priority].label}
                      </Badge>
                      {task.estimatedDuration && (
                        <Badge variant="outline">
                          <Clock className="mr-1 h-3 w-3" />
                          {task.estimatedDuration}
                        </Badge>
                      )}
                      {task.dueDate && (
                        <Badge variant="outline">
                          {new Date(task.dueDate).toLocaleDateString("nb-NO")}
                        </Badge>
                      )}
                    </div>

                    {task.estimatedPrice && (
                      <p className="text-sm font-medium tabular-nums">
                        {formatCurrency(Number(task.estimatedPrice))}
                      </p>
                    )}

                    {selectedVendor && (
                      <p className="text-muted-foreground text-xs">
                        Valgt aktør: <span className="text-foreground font-medium">{selectedVendor.name}</span>
                      </p>
                    )}

                    {totalEntries > 0 && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Fremdrift</span>
                          <span className="font-medium">
                            {completedEntries}/{totalEntries}
                          </span>
                        </div>
                        <Progress value={progressPercent} />
                      </div>
                    )}

                    {task.vendors.length > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {task.vendors.length}{" "}
                        {task.vendors.length === 1 ? "aktør" : "aktører"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
