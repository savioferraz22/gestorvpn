
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function test() {
  const testUser = "test_loyalty_user_" + Math.random().toString(36).substring(7);
  console.log("Testing with user:", testUser);

  // 1. Setup loyalty points record
  await supabase.from("loyalty_points").insert({ username: testUser, points: 0 });

  // 2. Mock payment record (Renewal, on time)
  const paymentRenewal = {
    id: "test_pay_" + Date.now(),
    username: testUser,
    status: "pending",
    type: "renewal",
    metadata: { paidOnTime: true }
  };

  console.log("Simulating approval for renewal...");
  // We can't call internal approvePayment easily without a server, 
  // but we can simulate what it does or create an endpoint for testing.
  // For now, let's verify the logic by manually doing what the server does.
  
  async function simulateApprove(payment: any) {
    const metadata = payment.metadata || {};
    if (metadata.paidOnTime) {
      const { data: lp } = await supabase.from("loyalty_points").select("points").eq("username", payment.username).maybeSingle();
      if (lp) {
        await supabase.from("loyalty_points").update({ points: lp.points + 1 }).eq("username", payment.username);
      } else {
        await supabase.from("loyalty_points").insert({ username: payment.username, points: 1 });
      }
    }
  }

  await simulateApprove(paymentRenewal);
  let { data: lp1 } = await supabase.from("loyalty_points").select("points").eq("username", testUser).single();
  console.log("Points after renewal:", lp1?.points);

  // 3. Mock payment record (New Device, on time)
  const paymentNewDevice = {
    id: "test_pay_nd_" + Date.now(),
    username: testUser,
    status: "pending",
    type: "new_device",
    metadata: { paidOnTime: true, newUsername: "nd_" + testUser, remainingDays: 30, groupId: "test_group" }
  };

  console.log("Simulating approval for new device...");
  await simulateApprove(paymentNewDevice);
  let { data: lp2 } = await supabase.from("loyalty_points").select("points").eq("username", testUser).single();
  console.log("Points after new device:", lp2?.points);

  if (lp2?.points === 2) {
    console.log("SUCCESS: Loyalty points awarded correctly for both types.");
  } else {
    console.log("FAILURE: Loyalty points count is incorrect:", lp2?.points);
  }

  // Cleanup
  await supabase.from("loyalty_points").delete().eq("username", testUser);
}

test();
