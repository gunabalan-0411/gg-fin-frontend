// Small pieces of the OCR row UI that belong to the alias / AI-mismatch feature.
import { BookmarkPlus, PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ocr/SourceBadge";
import { cn } from "@/utils";
import type { MappingCandidate, MappingKind, MappingRef } from "@/types";
import { shouldOfferRemember } from "@/utils/nameMapping";
import type { ComboboxPick, Suggestion } from "@/components/ocr/CustomerCombobox";

/** Fields the feature adds to an OCR row (merged into the page's Row type). */
export interface RowMappingFields {
  extracted_name?: string;                       // the OCR text, never overwritten by a pick
  mapping_suggestions?: MappingCandidate[];      // dropdown column 2 (from /extract)
  match_source?: "fuzzy" | MappingKind | null;   // how an auto-assigned customer was found
  matched_customer_name?: string | null;
  mapping_ref?: MappingRef | null;               // set when the customer came from an alias / AI-mismatch row
  remember_offer?: string | null;                // OCR text we offer to remember as an AI-mismatch name
}

export type MappableRow = RowMappingFields & {
  customer_id: number | null;
  customer_name: string;
  customer_suggestions: Suggestion[];
  product_type: "EDI" | "IOP";
};

/** Row patch when the user picks (or types) a customer in the dropdown. */
export function pickPatch<R extends MappableRow>(row: R, name: string, id: number | null, pick?: ComboboxPick): Partial<R> {
  const patch: Partial<MappableRow> = {
    customer_name: name,
    customer_id: id,
    mapping_ref: null,
    match_source: null,
    matched_customer_name: null,
    remember_offer: null,
    ...pick,
  };
  if (id != null && shouldOfferRemember({
    extractedName: row.extracted_name,
    pickedName: name,
    pickedId: id,
    mappingSuggestions: row.mapping_suggestions,
  })) {
    patch.remember_offer = (row.extracted_name ?? "").trim();
  }
  return patch as Partial<R>;
}

/** Everything that must be cleared when a row's customer is reset (e.g. the EDI <-> IOP toggle). A fresh object each call. */
export function clearedCustomer(): Pick<
  MappableRow,
  "customer_name" | "customer_id" | "customer_suggestions" | "mapping_suggestions" | "match_source"
  | "matched_customer_name" | "mapping_ref" | "remember_offer"
> {
  return {
    customer_name: "",
    customer_id: null,
    customer_suggestions: [],
    mapping_suggestions: [],
    match_source: null,
    matched_customer_name: null,
    mapping_ref: null,
    remember_offer: null,
  };
}

export function MatchBadge({ row }: { row: Pick<MappableRow, "match_source" | "matched_customer_name"> }) {
  if (row.match_source !== "ai_mismatch" && row.match_source !== "alias") return null;
  const ai = row.match_source === "ai_mismatch";
  return (
    <SourceBadge
      source={row.match_source}
      data-testid="match-badge"
      title={`Matched through ${ai ? "an AI-mismatch" : "a 2nd-alias"} name${row.matched_customer_name ? ` → ${row.matched_customer_name}` : ""}`}
    />
  );
}

/**
 * "Remember this" — offered after the user picks a customer whose name differs from the OCR text. A full-width banner:
 * a chip inside the (narrow) customer cell could not carry a readable prompt. Desktop puts it in a row under the record,
 * mobile inside the card.
 */
export function RememberBanner<R extends MappableRow>({
  row, onRemember, onDismiss, className,
}: { row: R; onRemember?: (row: R) => void; onDismiss?: (row: R) => void; className?: string }) {
  if (!row.remember_offer || !row.customer_id || !onRemember) return null;
  const word = row.remember_offer;
  return (
    <div
      data-testid="remember-chip"
      role="group"
      aria-label="Remember this name"
      className={cn("flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5", className)}
    >
      <BookmarkPlus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        Save <span className="font-medium text-foreground">“{word}”</span> as an AI-mismatch name for{" "}
        <span className="font-medium text-foreground">{row.customer_name || "this customer"}</span>?
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        tabIndex={-1}
        aria-label={`Remember “${word}” as an AI-mismatch name`}
        className="h-6 flex-shrink-0 px-2 text-[11px]"
        onClick={() => onRemember(row)}
      >
        Remember
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        tabIndex={-1}
        aria-label="Dismiss"
        className="h-6 w-6 flex-shrink-0"
        onClick={() => onDismiss?.(row)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/** The search/edit icon next to each extracted row — enabled once a customer is selected. */
export function MappingEditButton<R extends MappableRow>({
  row, onOpen, size = 3,
}: { row: R; onOpen?: (row: R) => void; size?: 3 | 4 }) {
  if (!onOpen) return null;
  const enabled = Boolean(row.customer_id);
  return (
    // The wrapper carries the tooltip: a disabled <button> swallows pointer events, so its own title would never show.
    // (-my-1: the 20px click target must not make the table row taller than its text line)
    <span title={enabled ? "Add alias / AI-mismatch names for this customer" : "Select a customer first"} className="inline-flex flex-shrink-0 -my-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        tabIndex={-1}
        data-testid="mapping-edit"
        aria-label="Add alias or AI-mismatch names"
        disabled={!enabled}
        onClick={() => onOpen(row)}
        className="h-5 w-5 rounded p-0 text-muted-foreground/60 hover:text-foreground"
      >
        <PenLine className={size === 4 ? "h-4 w-4" : "h-3 w-3"} />
      </Button>
    </span>
  );
}
