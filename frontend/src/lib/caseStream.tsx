/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import { useCaseStream, type CaseStreamState } from "./ws";

const CaseStreamContext = createContext<CaseStreamState | null>(null);

export function CaseStreamProvider({
  caseId,
  children,
}: {
  caseId: string | undefined;
  children: ReactNode;
}) {
  const stream = useCaseStream(caseId);
  return <CaseStreamContext.Provider value={stream}>{children}</CaseStreamContext.Provider>;
}

export function useSharedCaseStream(caseId: string | undefined): CaseStreamState {
  const ctx = useContext(CaseStreamContext);
  const direct = useCaseStream(ctx ? undefined : caseId);
  return ctx ?? direct;
}
