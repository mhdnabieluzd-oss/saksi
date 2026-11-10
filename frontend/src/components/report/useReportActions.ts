import { useMutation } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useVerifyReportHash(caseId: string) {
  return useMutation({
    mutationFn: (hash: string) => api.verifyReportHash(caseId, hash),
  });
}
