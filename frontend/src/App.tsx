import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ActiveCaseLayout } from "@/components/layout/ActiveCaseLayout";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/toaster";
import AgentOperations from "@/pages/app/AgentOperations";
import AttackStoryReplay from "@/pages/app/AttackStoryReplay";
import Benchmarks from "@/pages/app/Benchmarks";
import CommandCentre from "@/pages/app/CommandCentre";
import EvidenceExplorer from "@/pages/app/EvidenceExplorer";
import InvestigationWorkspace from "@/pages/app/InvestigationWorkspace";
import Investigations from "@/pages/app/Investigations";
import Reports from "@/pages/app/Reports";
import Settings from "@/pages/app/Settings";
import TanyaSaksi from "@/pages/app/TanyaSaksi";
import Landing from "@/pages/public/Landing";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<CommandCentre />} />
          <Route path="investigations" element={<Investigations />} />
          <Route path="benchmarks" element={<Benchmarks />} />
          <Route path="cases/:caseId" element={<ActiveCaseLayout />}>
            <Route index element={<InvestigationWorkspace />} />
            <Route path="agents" element={<AgentOperations />} />
            <Route path="evidence" element={<EvidenceExplorer />} />
            <Route path="story" element={<AttackStoryReplay />} />
            <Route path="ask" element={<TanyaSaksi />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
