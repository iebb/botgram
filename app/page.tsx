import AppShell from "@/components/AppShell";
import { StoreProvider } from "@/components/Store";

export default function Page() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
