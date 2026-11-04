export default function Home() {
  return (
    <main className="launch-home" id="home-content" tabIndex={-1}>
      <section className="launch-copy" aria-labelledby="launch-title">
        <h1 id="launch-title" tabIndex={-1}>
          <span>Build your</span>
          <strong>Racing team</strong>
        </h1>
        <p>From the workshop to the podium</p>
        <a className="launch-play" href="/play">
          <span>Play</span>
          <svg aria-hidden="true" viewBox="0 0 16 24">
            <path d="m4 3 8 9-8 9" />
          </svg>
        </a>
      </section>
    </main>
  );
}
