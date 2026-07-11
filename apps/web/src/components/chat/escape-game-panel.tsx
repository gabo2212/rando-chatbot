"use client";

import { Button } from "@chatbot/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbot/ui/components/dialog";
import { Input } from "@chatbot/ui/components/input";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";

import type { PublicEscapeState } from "@/lib/escape-room/engine";

type EscapeGamePanelProps = {
  state: PublicEscapeState;
  busy?: boolean;
  onHint: () => void;
  onExit: () => void;
  onSubmitCode: (code: string) => void;
  onPlayAgain?: () => void;
  onReturnToChat?: () => void;
};

function formatElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function EscapeGamePanel({
  state,
  busy,
  onHint,
  onExit,
  onSubmitCode,
  onPlayAgain,
  onReturnToChat,
}: EscapeGamePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [code, setCode] = useState("");
  const finished = state.status === "won" || state.status === "lost";

  const copyResult = async () => {
    const summary = state.resultSummary;
    if (!summary) return;
    const text = [
      summary.headline,
      `${state.gameName} — ${state.levelName}`,
      `Score: ${summary.finalScore}`,
      `Rank: ${summary.rank} — ${summary.rankTitle}`,
      `Turns: ${summary.turns}`,
      `Hints: ${summary.hintsUsed}`,
      `Wrong attempts: ${summary.wrongAttempts}`,
      `Clues: ${summary.cluesDiscovered}`,
      `Time: ${formatElapsed(summary.timeElapsedMs)}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
  };

  return (
    <>
      <aside className="flex w-full shrink-0 flex-col border-b border-white/15 bg-black md:w-72 md:border-b-0 md:border-l md:border-white/15">
        <button
          type="button"
          className="flex items-center justify-between px-3 py-2 font-mono text-[10px] tracking-widest text-white/70 md:hidden"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span>GAME STATUS</span>
          {collapsed ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
        </button>

        <div className={collapsed ? "hidden md:block" : "block"}>
          <div className="space-y-4 px-3 py-3">
            <div>
              <p className="font-mono text-xs font-bold tracking-[0.18em] text-white">
                {state.gameName}
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-wide text-white/50">
                {state.levelName}
              </p>
              <div className="mt-2 flex items-center gap-2 opacity-40">
                <div className="h-px flex-1 bg-white" />
                <span className="font-mono text-[9px] text-white">∞</span>
                <div className="h-px flex-1 bg-white" />
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-2 font-mono text-[10px]">
              <div>
                <dt className="text-white/40">SCORE</dt>
                <dd className="mt-0.5 text-white">{state.score}</dd>
              </div>
              <div>
                <dt className="text-white/40">ATTEMPTS</dt>
                <dd className="mt-0.5 text-white">{state.attemptsRemaining}</dd>
              </div>
              <div>
                <dt className="text-white/40">TURNS</dt>
                <dd className="mt-0.5 text-white">{state.turnsTaken}</dd>
              </div>
            </dl>

            <div>
              <p className="font-mono text-[9px] tracking-[0.14em] text-white/40">INVENTORY</p>
              {state.inventory.length === 0 ? (
                <p className="mt-1 font-mono text-[10px] text-white/35">Empty</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {state.inventory.map((item) => (
                    <li key={item.id} className="font-mono text-[10px] text-white/80">
                      · {item.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="font-mono text-[9px] tracking-[0.14em] text-white/40">
                DISCOVERED CLUES
              </p>
              {state.discoveredClues.length === 0 ? (
                <p className="mt-1 font-mono text-[10px] text-white/35">None yet</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {state.discoveredClues.map((clue) => (
                    <li key={clue.id} className="font-mono text-[10px] leading-snug text-white/80">
                      · {clue.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!finished ? (
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start font-mono text-[10px] tracking-wider"
                  disabled={busy || !state.nextHintPreview}
                  onClick={() => setHintOpen(true)}
                >
                  GET HINT ({state.hintsUsed}/{state.maxHints})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start font-mono text-[10px] tracking-wider"
                  disabled={busy}
                  onClick={() => setCodeOpen(true)}
                >
                  ENTER CODE
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start font-mono text-[10px] tracking-wider text-white/50"
                  disabled={busy}
                  onClick={onExit}
                >
                  EXIT GAME
                </Button>
              </div>
            ) : state.resultSummary ? (
              <div className="space-y-3 border-t border-white/15 pt-3">
                <p className="font-mono text-xs font-bold tracking-widest text-white">
                  {state.resultSummary.headline}
                </p>
                <dl className="space-y-1 font-mono text-[10px] text-white/70">
                  <div className="flex justify-between gap-2">
                    <dt>Score</dt>
                    <dd className="text-white">{state.resultSummary.finalScore}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Rank</dt>
                    <dd className="text-white">
                      {state.resultSummary.rank} — {state.resultSummary.rankTitle}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Turns</dt>
                    <dd>{state.resultSummary.turns}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Hints</dt>
                    <dd>{state.resultSummary.hintsUsed}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Wrong attempts</dt>
                    <dd>{state.resultSummary.wrongAttempts}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Clues</dt>
                    <dd>{state.resultSummary.cluesDiscovered}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Time</dt>
                    <dd>{formatElapsed(state.resultSummary.timeElapsedMs)}</dd>
                  </div>
                </dl>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="font-mono text-[10px] tracking-wider"
                    disabled={busy}
                    onClick={onPlayAgain}
                  >
                    PLAY AGAIN
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-mono text-[10px] tracking-wider"
                    disabled={busy}
                    onClick={onReturnToChat}
                  >
                    RETURN TO NORMAL CHAT
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-mono text-[10px] tracking-wider"
                    onClick={() => void copyResult()}
                  >
                    COPY RESULT
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <Dialog open={hintOpen} onOpenChange={setHintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CONFIRM HINT</DialogTitle>
            <DialogDescription>
              Hints cost 250 score and are charged once each. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="font-mono text-xs"
              onClick={() => setHintOpen(false)}
            >
              CANCEL
            </Button>
            <Button
              type="button"
              className="font-mono text-xs"
              disabled={busy}
              onClick={() => {
                setHintOpen(false);
                onHint();
              }}
            >
              GET HINT (−250)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>EXIT KEYPAD</DialogTitle>
            <DialogDescription>Enter the four-digit authentication code.</DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="····"
            className="font-mono tracking-[0.4em]"
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="font-mono text-xs"
              onClick={() => setCodeOpen(false)}
            >
              CANCEL
            </Button>
            <Button
              type="button"
              className="font-mono text-xs"
              disabled={busy || code.length !== 4}
              onClick={() => {
                const next = code;
                setCodeOpen(false);
                setCode("");
                onSubmitCode(next);
              }}
            >
              SUBMIT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
