export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-6 h-[calc(100dvh-8.5rem)] lg:h-[calc(100dvh-7rem)] -mb-6">
      {children}
    </div>
  );
}
