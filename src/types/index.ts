export interface EdiCustomer {
  customer_id: number;
  month?: string;
  loan_start_date?: string;
  customer_segment_id?: number;
  customer_name?: string;
  customer_address?: string;
  proof_aadhaar?: string;
  contact_number?: string;
  loan_amount?: number;
  disbursed_amount?: number;
  interest?: number;
  outstanding_balance?: number;
  remarks?: string;
  tamil_name?: string;
}

export interface IopCustomer {
  customer_id: number;
  month?: string;
  loan_start_date?: string;
  customer_segment_id?: number;
  customer_name?: string;
  customer_address?: string;
  proof_aadhaar?: string;
  contact_number?: string;
  interest_payment_frequency?: number;
  loan_amount?: number;
  disbursed_amount?: number;
  interest?: number;
  loan_closure?: number;
  remarks?: string;
  tamil_name?: string;
}

export interface EdiTransaction {
  transaction_id: number;
  customer_id: number;
  collection_date: string;
  amount: number;
  payment_mode: string;
  payment_status: string;
}

export interface IopTransaction {
  transaction_id: number;
  customer_id: number;
  collection_date: string;
  amount: number;
  payment_mode: string;
  payment_status: string;
}

export interface Expense {
  id: number;
  amount: number;
  date: string;
  notes?: string;
}

export interface MonthlyProfit {
  month: string;
  iop_profit: number;
  edi_profit: number;
  expense: number;
  unclaimed: number;
  defaulted: number;
  net_profit: number;
}

export interface DashboardSummary {
  current_month_iop_profit: number;
  current_month_edi_profit: number;
  current_month_expense: number;
  current_month_unclaimed: number;
  current_month_defaulted: number;
  current_month_net_profit: number;
  monthly_trends: MonthlyProfit[];
}

export interface DailyActivity {
  date: string;
  edi_count: number;
  iop_count: number;
  edi_amount: number;
  iop_amount: number;
}

export interface VoiceAlternative {
  customer_id: number;
  name: string;
  score: number;
}

export interface VoiceEntry {
  spoken_name: string;
  amount: number;
  customer_id?: number;
  customer_name?: string;
  matched: boolean;
  score?: number;
  alternatives?: VoiceAlternative[];
}

export type ProductType = "edi" | "iop";
