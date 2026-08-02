import { getCorporateActions } from "../src/services/idxServices/corporateActionService";

export async function testCorporateActions(ticker = "SSIA") {
  try {
    const corpAction = await getCorporateActions(ticker);
    console.log(JSON.stringify(corpAction, null, 2));
  } catch (err: any) {
    console.error(
      JSON.stringify(
        {
          success: false,
          error: err?.message || String(err),
        },
        null,
        2,
      ),
    );
  }
}

if (import.meta.main || process.argv[1]?.includes("testCorporateActions")) {
  await testCorporateActions();
}
