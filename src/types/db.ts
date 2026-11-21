// Hand-written row types mirroring supabase/migrations. Regenerate with
// `supabase gen types typescript` once a project is linked, if preferred.
export type MemberStatus = "pending_verification" | "pending_approval" | "active" | "rejected" | "suspended";
export type Role = "member" | "super_admin";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type ProjectStatus = "draft" | "open" | "full" | "active" | "matured" | "completed" | "cancelled";

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

export interface Project {
  id: string;
  code: string;
  name: string;
  partner: string;
  category: string;
  description: string | null;
  risk_disclosure: string | null;
  terms: string | null;
  terms_version: number;
  document_path: string | null;
  target_sen: number;
  min_sen: number;
  step_sen: number;
  max_per_member_sen: number | null;
  open_date: string | null;
  close_date: string | null;
  duration_months: number | null;
  maturity_date: string | null;
  coop_threshold_bp: number;
  coop_cap_bp: number;
  status: ProjectStatus;
  published_at: string | null;
  invested_on: string | null;
  invested_sen: number | null;
  investment_ref: string | null;
  investment_proof_path: string | null;
  matured_on: string | null;
  capital_received_sen: number | null;
  capital_received_ref: string | null;
  capital_received_proof_path: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface ProjectProgress {
  project_id: string;
  approved_sen: number;
  pending_sen: number;
  available_sen: number;
  participants: number;
  pending_count: number;
}

export interface ProjectParticipation {
  id: string;
  project_id: string;
  member_id: string;
  amount_sen: number;
  payment_date: string;
  transaction_ref: string;
  receipt_path: string;
  terms_version: number;
  terms_accepted_at: string;
  duplicate_flag: boolean;
  duplicate_reason: string | null;
  status: ReviewStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ProfitDeclaration {
  id: string;
  project_id: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  announced_on: string;
  rate_bp: number;
  gross_sen: number;
  fee_sen: number;
  fee_description: string | null;
  coop_rate_bp: number;
  capital_sen: number | null;
  member_total_sen: number | null;
  coop_total_sen: number | null;
  document_path: string | null;
  notes: string | null;
  status: "draft" | "declared" | "received" | "voided";
  declared_at: string | null;
  received_on: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface ProfitAllocation {
  id: string;
  declaration_id: string;
  project_id: string;
  member_id: string;
  capital_sen: number;
  amount_sen: number;
  coop_sen: number;
  created_at: string;
}

export interface ProjectWithdrawal {
  id: string;
  withdrawal_no: string;
  project_id: string;
  member_id: string;
  amount_sen: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_holder: string;
  notes: string | null;
  status: "pending" | "approved" | "paid" | "rejected" | "cancelled";
  review_notes: string | null;
  reviewed_at: string | null;
  paid_on: string | null;
  transaction_ref: string | null;
  proof_path: string | null;
  created_at: string;
}

export interface CapitalReturn {
  id: string;
  project_id: string;
  member_id: string;
  kind: "return" | "refund";
  amount_sen: number;
  paid_on: string;
  transaction_ref: string;
  proof_path: string | null;
  notes: string | null;
  reverses_id: string | null;
  created_at: string;
}

export interface MemberProjectWallet {
  project_id: string;
  code: string;
  name: string;
  partner: string;
  status: ProjectStatus;
  capital_sen: number;
  pending_capital_sen: number;
  capital_returned_sen: number;
  dividend_declared_sen: number;
  dividend_received_sen: number;
  withdrawal_pending_sen: number;
  withdrawn_sen: number;
  available_sen: number;
}

export type MeetingStatus = "draft" | "scheduled" | "ongoing" | "completed" | "cancelled";

export interface Meeting {
  id: string;
  meeting_no: string;
  title: string;
  agenda: string | null;
  meeting_date: string;
  start_time: string;
  end_time: string | null;
  mode: "physical" | "online" | "hybrid";
  location: string | null;
  online_url: string | null;
  audience: "all" | "selected";
  status: MeetingStatus;
  attendance_open: boolean;
  attendance_opened_at: string | null;
  ended_at: string | null;
  attendance_closes_at: string | null;
  finalized_at: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface MeetingInvitee {
  meeting_id: string;
  member_id: string;
  status: "pending" | "present" | "absent" | "excused";
  confirmed_at: string | null;
  method: "code" | "manual" | null;
  note: string | null;
  invited_at: string;
  updated_at: string;
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
