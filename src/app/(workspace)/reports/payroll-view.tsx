"use client";

import { useQuery } from "@tanstack/react-query";
import { WalletIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/skeletons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "@/hooks/use-workspace";
import { formatCurrency, formatHours, formatNumber } from "@/lib/format";
import { payrollQuery } from "@/lib/queries";
import type { ReportFilters } from "@/lib/report-layout";

export function PayrollView({ filters }: { filters: ReportFilters }) {
  const tenant = useTenant();
  const payroll = useQuery(payrollQuery(tenant.id, filters));

  if (payroll.isPending && !payroll.data) {
    return <PageSkeleton />;
  }

  const data = payroll.data;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        icon={WalletIcon}
        title="No paid hours in this range"
        description="Paid rates record gross pay and stay out of the volunteer grant totals."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {formatHours(data.hours)} · {formatCurrency(data.grossPay)} gross · {formatNumber(data.people)}{" "}
        {data.people === 1 ? "person" : "people"}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Group</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Pay rate</TableHead>
            <TableHead className="text-right">Gross pay</TableHead>
            <TableHead className="text-right">Entries</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.person}</TableCell>
              <TableCell>{row.group}</TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(row.hours)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(row.payRate)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(row.grossPay)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(row.entries)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
