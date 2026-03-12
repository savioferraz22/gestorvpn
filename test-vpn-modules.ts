import fetch from "node-fetch";

async function testModule(moduleName: string, paramsObj: any) {
  const VPN_API_URL = "https://pweb.cloudbrasil.shop/core/apiatlas.php";
  const VPN_API_KEY = "LTm2H0TnZwKY560Vqj7gfbxeIL";

  const params = new URLSearchParams();
  params.append("passapi", VPN_API_KEY);
  params.append("module", moduleName);
  for (const [k, v] of Object.entries(paramsObj)) {
    params.append(k, v as string);
  }

  try {
    const vpnRes = await fetch(VPN_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await vpnRes.text();
    console.log(`Module ${moduleName}:`, text.substring(0, 100));
  } catch (e: any) {
    console.log(`Module ${moduleName} error:`, e.message);
  }
}

async function run() {
  await testModule("createuser", { user: "testuser123" });
}

run();
