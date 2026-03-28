import { Outlet } from "react-router-dom"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/layout/app-sidebar"
import { BreadcrumbNav } from "@/layout/breadcrumb-nav"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex shrink-0 items-center gap-3 px-6 py-4">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px shrink-0 bg-border" />
          <BreadcrumbNav />
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
