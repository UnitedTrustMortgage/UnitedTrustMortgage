// GET /api/auth/me
//
// Returns the current operator profile if a valid session token is present.
// Used by the operator UI on page load to decide whether to redirect to
// the login screen.

import { requireOperator, json, authErrorResponse } from "./_lib.mjs";

export const handler = async (event) => {
  if (event.httpMethod !== "GET") return { statusCode: 405, body: "method not allowed" };
  try {
    const { operator, session } = await requireOperator(event);
    return json(200, {
      operator: {
        id: operator.id,
        name: operator.name,
        email: operator.email,
        isAdmin: operator.is_admin,
      },
      session: {
        expiresAt: session.expires_at,
      },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
};
