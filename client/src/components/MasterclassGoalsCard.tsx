import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export interface MasterclassGoal {
  targetRevenue: string;
  targetRegistrants: number;
  targetAttendeeRate: string;
  targetClosingRate: string;
  targetRoas: string;
  targetWebinars: number;
}

export interface MasterclassActuals {
  masterclasses: number;
  revenue: number;
  registrants: number;
  attendeeRate: number | null;
  closingRate: number | null;
  roas: number | null;
}

type GoalForm = Record<keyof MasterclassGoal, string>;

const toForm = (goal: MasterclassGoal | null | undefined): GoalForm => ({
  targetRevenue: String(Number(goal?.targetRevenue ?? 0)),
  targetRegistrants: String(goal?.targetRegistrants ?? 0),
  targetAttendeeRate: String(Number(goal?.targetAttendeeRate ?? 40)),
  targetClosingRate: String(Number(goal?.targetClosingRate ?? 5)),
  targetRoas: String(Number(goal?.targetRoas ?? 3)),
  targetWebinars: String(goal?.targetWebinars ?? 4),
});

const FIELDS: { key: keyof MasterclassGoal; label: string; suffix?: string; prefix?: string }[] = [
  { key: "targetRevenue", label: "Revenue", prefix: "$" },
  { key: "targetWebinars", label: "Masterclasses" },
  { key: "targetRegistrants", label: "Registrants" },
  { key: "targetAttendeeRate", label: "Show-up rate", suffix: "%" },
  { key: "targetClosingRate", label: "Closing rate", suffix: "%" },
  { key: "targetRoas", label: "ROAS", suffix: "x" },
];

// Targets for masterclasses, measured against the Event Tracker's masterclass events in the selected dates.
export function MasterclassGoalsCard({
  clientId,
  goal,
  actuals,
  periodLabel,
  canEdit,
}: {
  clientId: string;
  goal: MasterclassGoal | null | undefined;
  actuals: MasterclassActuals;
  periodLabel: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GoalForm>(toForm(goal));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/webinar-goals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRevenue: form.targetRevenue || "0",
          targetRegistrants: parseInt(form.targetRegistrants) || 0,
          targetAttendeeRate: form.targetAttendeeRate || "0",
          targetClosingRate: form.targetClosingRate || "0",
          targetRoas: form.targetRoas || "0",
          targetWebinars: parseInt(form.targetWebinars) || 0,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save goals");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/webinar-goals`] });
      setEditing(false);
      toast({ title: "Masterclass goals saved" });
    },
    onError: (error: Error) => toast({ title: "Goals not saved", description: error.message, variant: "destructive" }),
  });

  const rows = goal ? [
    { label: "Revenue", actual: actuals.revenue, target: Number(goal.targetRevenue), show: (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    { label: "Masterclasses", actual: actuals.masterclasses, target: goal.targetWebinars, show: (v: number) => v.toLocaleString() },
    { label: "Registrants", actual: actuals.registrants, target: goal.targetRegistrants, show: (v: number) => v.toLocaleString() },
    { label: "Show-up rate", actual: actuals.attendeeRate, target: Number(goal.targetAttendeeRate), show: (v: number) => `${v.toFixed(1)}%` },
    { label: "Closing rate", actual: actuals.closingRate, target: Number(goal.targetClosingRate), show: (v: number) => `${v.toFixed(1)}%` },
    { label: "ROAS", actual: actuals.roas, target: Number(goal.targetRoas), show: (v: number) => `${v.toFixed(2)}x` },
  ] : [];

  return (
    <Card className="bg-gray-900 border-gray-800 mb-8" data-testid="card-masterclass-goals">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-white">
            <Target className="h-5 w-5 text-blue-500" />
            Masterclass Goals
          </CardTitle>
          <p className="mt-1 text-sm text-gray-400">Progress from masterclass events · {periodLabel}</p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => { setForm(toForm(goal)); setEditing(true); }} data-testid="button-set-goals">
            <Pencil className="h-4 w-4 mr-2" /> {goal ? "Edit goals" : "Set goals"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!goal ? (
          <p className="text-sm text-gray-400">No masterclass goals set yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {rows.map(row => {
              const pct = row.actual !== null && row.target > 0 ? Math.min(100, (row.actual / row.target) * 100) : 0;
              return (
                <div key={row.label} className="rounded-md border border-gray-800 bg-gray-950/60 p-3" data-testid={`goal-${row.label.toLowerCase().replace(/\W+/g, "-")}`}>
                  <p className="text-xs text-gray-400">{row.label}</p>
                  <p className="mt-1 text-sm text-white">
                    {row.actual === null ? "—" : row.show(row.actual)} <span className="text-gray-500">/ {row.show(row.target)}</span>
                  </p>
                  <Progress value={pct} className="mt-2 h-1.5" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Masterclass goals</DialogTitle>
            <DialogDescription>Targets that masterclass events in the Event Tracker are measured against.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(field => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`goal-${field.key}`}>
                  {field.label}{field.prefix ? ` (${field.prefix})` : ""}{field.suffix ? ` (${field.suffix})` : ""}
                </Label>
                <Input
                  id={`goal-${field.key}`}
                  type="number"
                  min="0"
                  step={field.key === "targetRegistrants" || field.key === "targetWebinars" ? "1" : "any"}
                  value={form[field.key]}
                  onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  data-testid={`input-goal-${field.key}`}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-goals">
              {saveMutation.isPending ? "Saving..." : "Save goals"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
