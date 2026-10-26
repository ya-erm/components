import type { ReactNode } from "react";

export default function ComponentsLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      <div data-components-background>{children}</div>
      {modal}
    </>
  );
}
