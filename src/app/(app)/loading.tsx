export default function AppLoading() {
  return (
    <div className="animate-fade space-y-6">
      <div className="skeleton h-28 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="skeleton h-36 rounded-2xl" />
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="skeleton h-44 rounded-2xl" />
            <div className="skeleton h-44 rounded-2xl" />
          </div>
        </div>
        <div className="space-y-6">
          <div className="skeleton h-52 rounded-2xl" />
          <div className="skeleton h-52 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
