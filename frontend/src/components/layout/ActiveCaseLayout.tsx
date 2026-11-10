import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { setActiveCase } from "@/lib/activeCase";
import { CaseStreamProvider } from "@/lib/caseStream";

/** Route wrapper for /app/cases/:caseId/*. Marks that case as the active investigation and shares one WS stream. */
export function ActiveCaseLayout() {
  const { caseId } = useParams();
  useEffect(() => {
    if (caseId) setActiveCase(caseId);
  }, [caseId]);
  return (
    <CaseStreamProvider caseId={caseId}>
      <Outlet />
    </CaseStreamProvider>
  );
}
