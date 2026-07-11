export default function DrivePage() {
  return (
    <div className="relative h-full min-h-0 w-full bg-black">
      <iframe
        src="/games/procedural-drive.html"
        title="Endless Drive"
        allow="autoplay; fullscreen; gamepad"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  );
}
