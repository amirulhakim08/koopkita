export type BusinessSnapshot = {
  name: string; ssm_no: string | null; ssm_verified: boolean; phone: string; email: string | null; address: string | null;
  bank_name: string | null; bank_account_no: string | null; bank_account_holder: string | null; logo_path: string | null;
  sst_reg_no: string | null;
};

export type DocumentJson = {
  kind: "invoice" | "receipt" | "quote";
  invoice: {
    id: string; invoice_no: string | null; status: string; issue_date: string; due_date: string; is_direct?: boolean;
    scope?: string | null; terms?: string | null;
    subtotal_sen: number; discount_sen: number; tax_rate_bp: number; tax_sen: number; total_sen: number; paid_sen: number;
    notes: string | null; cancel_reason: string | null; cancelled_at: string | null; share_token: string | null; overdue: boolean;
    customer: { name: string; phone: string | null; email: string | null; address: string | null };
    business: BusinessSnapshot;
    items: { description: string; quantity: number; unit_price_sen: number; discount_sen: number; line_total_sen: number }[];
  };
  payment: null | {
    id: string; receipt_no: string; amount_sen: number; paid_on: string; method: string; reference: string | null;
    reversed: boolean; reverse_reason: string | null; share_token: string; balance_after_sen: number;
  };
};
