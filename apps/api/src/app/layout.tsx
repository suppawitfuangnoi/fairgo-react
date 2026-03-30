export const metadata = {
  title: "FAIRGO API",
  description: "FAIRGO - Fair-pricing ride-hailing platform API",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
