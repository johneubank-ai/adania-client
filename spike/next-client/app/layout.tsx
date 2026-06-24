export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body style={{ font: "15px/1.5 system-ui", background: "#0b1020", color: "#e7ecff", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
