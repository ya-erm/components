import type { ReactNode } from "react";

export default function ComponentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div data-components-background>{children}</div>
  );
}
