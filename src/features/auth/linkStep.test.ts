import { deriveLinkStep, pendingEmail } from "./linkStep";

describe("deriveLinkStep", () => {
  it("asks for an email when there is no user", () => {
    expect(deriveLinkStep(null, false)).toBe("email");
  });

  it("asks for an email for a fresh anonymous user", () => {
    expect(deriveLinkStep({ is_anonymous: true, email: null }, false)).toBe("email");
  });

  it("waits for confirmation once an anonymous user attached an email", () => {
    expect(deriveLinkStep({ is_anonymous: true, email: "a@b.c", email_confirmed_at: null }, false)).toBe(
      "confirm",
    );
    expect(deriveLinkStep({ is_anonymous: true, new_email: "a@b.c" }, false)).toBe("confirm");
  });

  it("asks for a password once the email is confirmed", () => {
    const user = { is_anonymous: false, email: "a@b.c", email_confirmed_at: "2026-09-04T00:00:00Z" };
    expect(deriveLinkStep(user, false)).toBe("password");
  });

  it("is done once the password has been set", () => {
    const user = { is_anonymous: false, email: "a@b.c", email_confirmed_at: "2026-09-04T00:00:00Z" };
    expect(deriveLinkStep(user, true)).toBe("done");
  });

  it("treats a permanent user with an unconfirmed email change as pending", () => {
    const user = { is_anonymous: false, email: "a@b.c", new_email: "x@y.z", email_confirmed_at: null };
    expect(deriveLinkStep(user, true)).toBe("confirm");
  });
});

describe("pendingEmail", () => {
  it("prefers new_email over email", () => {
    expect(pendingEmail({ email: "old@x.y", new_email: "new@x.y" })).toBe("new@x.y");
    expect(pendingEmail({ email: "old@x.y" })).toBe("old@x.y");
    expect(pendingEmail({})).toBeNull();
    expect(pendingEmail(null)).toBeNull();
  });
});
