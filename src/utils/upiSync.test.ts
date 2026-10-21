import { describe, expect, it } from "vitest";
import { unlinkError } from "./upiSync";

const http = (status: number, data: unknown) => ({ response: { status, data } });

describe("unlinkError", () => {
  it("uses the server's reason when it gave one", () => {
    expect(unlinkError(http(500, { detail: "database is down" }))).toEqual({ message: "database is down", stale: false });
  });

  it("says something sensible when there is no reason, or it is not text", () => {
    expect(unlinkError(http(500, {})).message).toBe("Could not unlink — please try again");
    expect(unlinkError(http(422, { detail: [{ msg: "x" }] })).message).toBe("Could not unlink — please try again");
    expect(unlinkError(new Error("Network Error")).message).toBe("Could not unlink — please try again");
    expect(unlinkError(undefined).message).toBe("Could not unlink — please try again");
  });

  it("'not linked' / 'not found' mean the list on screen is out of date", () => {
    expect(unlinkError(http(400, { detail: "This transaction is not linked to a customer" })).stale).toBe(true);
    expect(unlinkError(http(404, { detail: "Transaction not found" })).stale).toBe(true);
    expect(unlinkError(http(500, {})).stale).toBe(false);
    expect(unlinkError(new Error("Network Error")).stale).toBe(false);
  });
});
