export type ViewState =
  | "login"
  | "dashboard"
  | "create_user"
  | "show_credentials"
  | "pix_flow"
  | "admin"
  | "tickets"
  | "ticket_detail"
  | "admin_tickets"
  | "admin_ticket_detail"
  | "help";

export type AdminTab =
  | "overview"
  | "users"
  | "devices"
  | "tickets"
  | "payments"
  | "refunds"
  | "change_requests"
  | "reports";

export interface Referral {
  id: string;
  referrer_username: string;
  referred_username: string;
  status: string;
  created_at: string;
}

export interface UserData {
  login: string;
  senha?: string;
  pass?: string;
  password?: string;
  expira: string;
  status: string;
  limite: number;
  uuid?: string;
  isTrusted?: boolean;
  points?: number;
  referrals?: Referral[];
  refundRequest?: any;
  changeRequests?: any[];
  lastPaymentDate?: string;
  payments?: any[];
}

export interface Ticket {
  id: string;
  username: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender: string;
  message: string;
  created_at: string;
}

export interface GroupData {
  groupId: string;
  users: string[];
  plan: {
    plan_type: string;
    plan_months: number;
    plan_devices: number;
    plan_price: number;
  };
}

export interface AdminReports {
  testsHistory: { date: string; count: number }[];
  salesHistory: { date: string; count: number; revenue: number }[];
  totalRevenue: number;
  totalSales: number;
  totalTests: number;
  conversionRate: number;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  message: string;
}
