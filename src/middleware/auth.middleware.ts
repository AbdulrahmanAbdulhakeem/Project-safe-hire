import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
// import { Role } from '../generated/prisma/client';


declare global {
  namespace Express {
    interface Request {
      user?: typeof auth.$Infer.Session.user;
      session?: typeof auth.$Infer.Session.session;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session) {
      return res.status(401).json({ error: "Unauthorized. Valid session required." });
    }

    req.user = session.user;
    req.session = session.session;
    next();
  } catch (error) {
    next(error);
  }

   const session = await auth.api.getSession({
        headers: new Headers(req.headers as Record<string, string>),
    })

    if (!session) {
    return res.status(401).json({ error: "Unauthorized access" });
  }

  (req as any).user = session.user;
  (req as any).session = session.session;

  next();
};

export const requireRole = (role: "ADMIN" | "COMPANY") => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Forbidden. Action requires ${role} privileges.` });
    }
    next();
  };
};

// export const requireRole = (roles: Role[]) => {
//   return (req: Request, res: Response, next: NextFunction) => {
//     if (!req.user || !roles.includes(req.user.role as Role)) {
//       return res.status(403).json({ error: "Forbidden" });
//     }
//     next();
//   };
// };