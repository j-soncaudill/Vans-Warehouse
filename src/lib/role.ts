import { createContext, useContext } from "react";
import type { Role } from "@/lib/pin";

export type RoleState = { role: Role; switchRole: () => void };

export const RoleContext = createContext<RoleState>({ role: "field", switchRole: () => undefined });

export const useRole = () => useContext(RoleContext);
export const useIsAdmin = () => useContext(RoleContext).role === "admin";
