import { useReducer, useEffect, useCallback, useRef } from "react";

type Grid = number[][];

interface GameState {
  grid: Grid;
  score: number;
  best: number;
  gameOver: boolean;
}

type GameAction =
  | { type: "MOVE"; direction: "up" | "down" | "left" | "right" }
  | { type: "RESET" };

function createEmpty(): Grid {
  return Array.from({ length: 4 }, () => Array(4).fill(0));
}

function clone(grid: Grid): Grid {
  return grid.map(row => [...row]);
}

function addRandom(grid: Grid): Grid {
  const g = clone(grid);
  const empty: [number, number][] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (g[r][c] === 0) empty.push([r, c]);
  if (!empty.length) return g;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return g;
}

function transpose(grid: Grid): Grid {
  return grid[0].map((_, c) => grid.map(row => row[c]));
}

function reverseRows(grid: Grid): Grid {
  return grid.map(row => [...row].reverse());
}

function slideLeft(grid: Grid): { grid: Grid; score: number; moved: boolean } {
  let totalScore = 0;
  let moved = false;
  const result = grid.map(row => {
    const tiles = row.filter(v => v !== 0);
    const merged: number[] = [];
    let i = 0;
    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        const val = tiles[i] * 2;
        merged.push(val);
        totalScore += val;
        i += 2;
      } else {
        merged.push(tiles[i]);
        i++;
      }
    }
    while (merged.length < 4) merged.push(0);
    if (merged.some((v, idx) => v !== row[idx])) moved = true;
    return merged;
  });
  return { grid: result, score: totalScore, moved };
}

function applyMove(grid: Grid, dir: "up" | "down" | "left" | "right"): { grid: Grid; score: number; moved: boolean } {
  let g = clone(grid);
  if (dir === "up") g = transpose(g);
  else if (dir === "down") g = reverseRows(transpose(g));
  else if (dir === "right") g = reverseRows(g);

  const result = slideLeft(g);

  let final = result.grid;
  if (dir === "up") final = transpose(final);
  else if (dir === "down") final = transpose(reverseRows(final));
  else if (dir === "right") final = reverseRows(final);

  return { grid: final, score: result.score, moved: result.moved };
}

function canMove(grid: Grid): boolean {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) return true;
      if (c < 3 && grid[r][c] === grid[r][c + 1]) return true;
      if (r < 3 && grid[r][c] === grid[r + 1][c]) return true;
    }
  return false;
}

function newGame(): GameState {
  let g = createEmpty();
  g = addRandom(addRandom(g));
  return {
    grid: g,
    score: 0,
    best: parseInt(localStorage.getItem("2048-best") || "0", 10),
    gameOver: false
  };
}

function reducer(state: GameState, action: GameAction): GameState {
  if (action.type === "RESET") {
    return { ...newGame(), best: state.best };
  }
  if (state.gameOver) return state;

  const result = applyMove(state.grid, action.direction);
  if (!result.moved) return state;

  const newGrid = addRandom(result.grid);
  const newScore = state.score + result.score;
  const newBest = Math.max(newScore, state.best);
  if (newBest > state.best) localStorage.setItem("2048-best", String(newBest));

  return {
    grid: newGrid,
    score: newScore,
    best: newBest,
    gameOver: !canMove(newGrid)
  };
}

const BG: Record<number, string> = {
  0: "rgba(255,255,255,0.04)", 2: "#eee4da", 4: "#ede0c8", 8: "#f2b179",
  16: "#f59563", 32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72",
  256: "#edcc61", 512: "#edc850", 1024: "#edc53f", 2048: "#edc22e"
};

const FG: Record<number, string> = { 2: "#776e65", 4: "#776e65" };

export function Game2048({ onClose, agentStatus, taskTitle }: {
  onClose: () => void;
  agentStatus: string;
  taskTitle: string | null;
}) {
  const [state, dispatch] = useReducer(reducer, null, () => newGame());
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    const map: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
    };
    const dir = map[e.key];
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch({ type: "MOVE", direction: dir });
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleKey]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    const dir: "up" | "down" | "left" | "right" =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    dispatch({ type: "MOVE", direction: dir });
  };

  return (
    <div className="game-overlay" onClick={onClose}>
      <div
        className="game-modal"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="game-header">
          <h3>2048</h3>
          <div className="game-scores">
            <div className="game-score-box">
              <small>SCORE</small>
              <strong>{state.score}</strong>
            </div>
            <div className="game-score-box">
              <small>BEST</small>
              <strong>{state.best}</strong>
            </div>
          </div>
          <button className="game-close" onClick={onClose}>&times;</button>
        </div>

        <div className={`game-agent-bar ${agentStatus === "done" ? "done" : agentStatus === "failed" ? "failed" : ""}`}>
          {agentStatus === "done" ? (
            <>
              <span className="game-agent-dot done" />
              <span>AI 已完成！</span>
              <button className="game-agent-btn" onClick={onClose}>查看结果</button>
            </>
          ) : agentStatus === "failed" ? (
            <>
              <span className="game-agent-dot failed" />
              <span>AI 执行出错</span>
            </>
          ) : (
            <>
              <span className="game-agent-dot running" />
              <span>AI 正在生成：{taskTitle ?? "处理中..."}</span>
            </>
          )}
        </div>

        <div className="game-board">
          {state.grid.flat().map((val, i) => (
            <div
              key={i}
              className={`game-cell${val ? " active" : ""}${val >= 1024 ? " wide" : ""}`}
              style={{
                backgroundColor: BG[val] || "#3c3a32",
                color: FG[val] || "#f9f6f2"
              }}
            >
              {val || ""}
            </div>
          ))}
          {state.gameOver && (
            <div className="game-over">
              <p>Game Over!</p>
              <button onClick={() => dispatch({ type: "RESET" })}>再来一局</button>
            </div>
          )}
        </div>

        <div className="game-footer">
          <button className="game-reset-btn" onClick={() => dispatch({ type: "RESET" })}>重新开始</button>
          <span className="game-hint">方向键 / 滑动</span>
        </div>
      </div>
    </div>
  );
}
