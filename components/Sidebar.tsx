import React from "react";
import { Page } from "../types";
import { DashboardIcon, SettingsIcon, BriefcaseIcon } from "./icons";

interface SidebarProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, setCurrentPage }) => {
  const navItems = [
    { id: Page.Dashboard, label: "Dashboard", icon: DashboardIcon },
    // Use SettingsIcon here; previous use of Twilio's Message class caused a runtime error
    { id: Page.Settings, label: "Messenger", icon: SettingsIcon },
    // Feedback page intentionally hidden from sidebar navigation.
  ];

  return (
    <aside className="w-64 bg-white text-gray-800 flex flex-col transition-all duration-300 border-r border-gray-200">
      <div className="h-20 flex items-center justify-start px-6">
        <div className="bg-primary-600 p-2 rounded-lg">
          <BriefcaseIcon className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 ml-3">BizReview</h1>
      </div>
      <nav className="flex-1 px-4 py-6">
        <ul>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setCurrentPage(item.id)}
                  className={`w-full flex items-center px-4 py-3 my-1 rounded-lg transition-colors duration-200 ${
                    isActive
                      ? "bg-primary-50 text-primary-600"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  }`}
                >
                  <Icon className="h-6 w-6 mr-3" />
                  <span className="font-semibold">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center">
          <img
            src="https://i.pravatar.cc/40?u=bizowner"
            alt="Owner"
            className="rounded-full"
          />
          <div className="ml-3">
            <p className="font-semibold text-sm text-gray-800">Biz Owner</p>
            <p className="text-xs text-gray-500">Acme Inc.</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
