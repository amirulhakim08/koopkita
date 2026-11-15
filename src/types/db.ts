// Hand-written row types mirroring supabase/migrations. Regenerate with
// `supabase gen types typescript` once a project is linked, if preferred.
export type MemberStatus = "pending_verification" | "pending_approval" | "active" | "rejected" | "suspended";
export type Role = "member" | "super_admin";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type SaleStatus = "draft" | "pending_payment" | "pending_review" | "approved" | "rejected" | "cancelled";
export type SlotStatus = "available" | "reserved" | "confirmed" | "cancelled";
export type CampaignStatus = "draft" | "open" | "closed" | "completed";

export interface Profile {
  id: string;
  role: Role;
  status: MemberStatus;
  member_no: number | null;
  membership_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  ic_number: string | null;
  address: string | null;
  state: string | null;
  postcode: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_holder: string | null;
  email_verified_at: string | null;
  approved_at: string | null;
  status_reason: string | null;
  created_at: string;
}

export interface ShareTransaction {
  id: string;
  member_id: string;
  txn_type: "payment" | "adjustment";
  amount_sen: number;
  payment_date: string | null;
  transaction_ref: string | null;
  receipt_path: string | null;
  status: ReviewStatus;
  duplicate_flag: boolean;
  duplicate_reason: string | null;
  reason: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  year: number;
  start_date: string;
  closing_date: string;
  shares_per_cattle: number;
  price_per_share_sen: number;
  commission_per_share_sen: number;
  full_cattle_commission_sen: number;
  reservation_expiry_hours: number;
  status: CampaignStatus;
  description: string | null;
  created_at: string;
}

export interface QurbanSale {
  id: string;
  sale_no: string;
  campaign_id: string;
  member_id: string;
  buyer_id: string;
  share_count: number;
  price_per_share_sen: number;
  total_sen: number;
  status: SaleStatus;
  notes: string | null;
  reservation_expires_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface PaymentSubmission {
  id: string;
  sale_id: string;
  amount_sen: number;
  payment_date: string;
  transaction_ref: string;
  receipt_path: string;
  status: "pending" | "verified" | "rejected";
  duplicate_flag: boolean;
  duplicate_reason: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface CommissionEntry {
  id: string;
  member_id: string;
  sale_id: string | null;
  cattle_id: string | null;
  entry_type: "standard" | "full_cattle_incentive" | "reversal" | "adjustment";
  amount_sen: number;
  share_count: number | null;
  description: string;
  reverses_id: string | null;
  created_at: string;
}

export interface CommissionPayout {
  id: string;
  payout_no: string;
  member_id: string;
  amount_sen: number;
  payment_date: string;
  transaction_ref: string;
  proof_path: string | null;
  notes: string | null;
  reverses_id: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
