export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 px-16 py-32">
        <h1 className="text-4xl font-bold tracking-tight text-black dark:text-white">
          ScrollTunes
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Live lyrics teleprompter for musicians
        </p>
      </main>
    </div>
  )
}
