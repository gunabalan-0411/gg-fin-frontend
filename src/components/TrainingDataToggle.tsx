import { Switch } from "@/components/ui/Switch";
import { useConnection } from "@/hooks/useConnectionStatus";
import { cn } from "@/utils";

/**
 * "Save data for training" — in the bottom bar of the OCR and Voice pages. ON by default; its state at the moment of
 * Submit decides whether the page image / recordings + table are sent to Google Drive (fintech folder).
 */
export function TrainingDataToggle({
  checked, onCheckedChange, className,
}: { checked: boolean; onCheckedChange: (on: boolean) => void; className?: string }) {
  const drive = useConnection("drive");
  const notConnected = checked && drive.connected === false;
  return (
    <div data-testid="training-toggle" className={cn("flex items-center gap-2", className)}>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label="Save data for training"
        data-testid="training-switch"
        title="Save the page / recordings and the table to Google Drive (fintech folder) for training"
      />
      <span className="whitespace-nowrap text-[11.5px] font-medium text-muted-foreground">Save data for training</span>
      {notConnected && (
        <span data-testid="training-drive-warning" className="whitespace-nowrap text-[11px] text-amber-600 dark:text-amber-400">
          Drive not connected — connect it in Settings
        </span>
      )}
    </div>
  );
}
