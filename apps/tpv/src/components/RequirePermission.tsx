'use client';

import { ReactNode, useState } from 'react';
import { Permission, useAuthStore } from '@/store/authStore';
import ManagerOverrideModal from './ManagerOverrideModal';

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  onExecute?: () => void | Promise<void>;
}

export default function RequirePermission({
  permission,
  children,
  onExecute,
}: RequirePermissionProps) {
  const [showOverride, setShowOverride] = useState(false);
  const hasPermission = useAuthStore((state) => state.hasPermission(permission));

  if (hasPermission) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        onClick={() => setShowOverride(true)}
        className="opacity-50 cursor-not-allowed"
      >
        {children}
      </div>

      <ManagerOverrideModal
        isOpen={showOverride}
        onClose={() => setShowOverride(false)}
        permission={permission}
        onSuccess={async () => {
          setShowOverride(false);
          if (onExecute) await onExecute();
        }}
      />
    </>
  );
}
