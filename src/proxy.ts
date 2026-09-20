import { NextResponse, type NextRequest } from "next/server";

// Filtre léger : redirige vers /login s'il n'y a aucun cookie de session.
// La vraie validation (base de données) est faite côté serveur par requireUser().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("erp_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
