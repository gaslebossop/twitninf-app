import { useState, useRef, useEffect } from "react";

const videos = [
  {
    id: 1,
    user: "@marie_cuisine",
    avatar: "MC",
    desc: "La recette de ramen la plus facile du monde 🍜 #cuisine #ramen #facile",
    audio: "Original Sound - marie_cuisine",
    likes: 248300,
    comments: 4120,
    shares: 8900,
    favs: 32100,
    bg: ["#1a0533", "#3d0068", "#7b00cc"],
    emoji: "🍜",
  },
  {
    id: 2,
    user: "@theo_skate",
    avatar: "TS",
    desc: "Mon meilleur trick de l'année 🛹 POV rooftop session Lyon 🔥 #skate #lyon #trick",
    audio: "GUTS - Olivia Rodrigo",
    likes: 512000,
    comments: 9800,
    shares: 23400,
    favs: 71000,
    bg: ["#001a33", "#003d80", "#0066cc"],
    emoji: "🛹",
  },
  {
    id: 3,
    user: "@luna_art",
    avatar: "LA",
    desc: "Peinture satisfaisante en time-lapse 🎨 3h de travail en 30 secondes ✨ #art #painting",
    audio: "lofi beats - chill mix",
    likes: 1200000,
    comments: 18500,
    shares: 45000,
    favs: 198000,
    bg: ["#1a0010", "#4d0030", "#cc0066"],
    emoji: "🎨",
  },
  {
    id: 4,
    user: "@max_fitness",
    avatar: "MF",
    desc: "Routine 10 min abs AUCUN matériel 💪 Résultats en 30 jours garanti #fitness #abs",
    audio: "POWER - Kanye West",
    likes: 890000,
    comments: 12300,
    shares: 34000,
    favs: 120000,
    bg: ["#001a00", "#004d00", "#009900"],
    emoji: "💪",
  },
  {
    id: 5,
    user: "@jade_travel",
    avatar: "JT",
    desc: "Le coucher de soleil le plus fou à Santorini 🌅 mets le son 🔊 #travel #greece #sunset",
    audio: "Golden Hour - JVKE",
    likes: 2100000,
    comments: 31000,
    shares: 89000,
    favs: 340000,
    bg: ["#33150a", "#994400", "#ff7700"],
    emoji: "🌅",
  },
];

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n;
}

const TT = "'Noto Sans', 'Helvetica Neue', Arial, sans-serif";

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="32" height="32" fill={filled ? "#fe2c55" : "white"}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill={filled ? "#ffe033" : "white"}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="white">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l4.93-1.37A9.96 9.96 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="white">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
    </svg>
  );
}

function ActionBtn({ icon, label, onClick, color = "white" }) {
  return (
    <div onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
      {icon}
      <span style={{ color, fontSize: 12, fontWeight: 700, fontFamily: TT, textShadow: "0 1px 4px rgba(0,0,0,0.9)", letterSpacing: "0.01em" }}>
        {label}
      </span>
    </div>
  );
}

function VideoCard({ video, active }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likes);
  const [showHeart, setShowHeart] = useState(false);
  const lastTap = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) { setLiked(true); setLikeCount(c => c + 1); }
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 900);
    }
    lastTap.current = now;
  };

  return (
    <div
      onClick={handleTap}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: `linear-gradient(170deg, ${video.bg[0]} 0%, ${video.bg[1]} 55%, ${video.bg[2]} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        userSelect: "none",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 120, opacity: active ? 0.2 : 0.08, transition: "opacity 0.5s", pointerEvents: "none" }}>
        {video.emoji}
      </div>

      {/* Bottom gradient */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.1) 42%, transparent 68%)",
        pointerEvents: "none",
      }} />

      {/* Double-tap heart */}
      {showHeart && (
        <div style={{
          position: "absolute", top: "38%", left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: 100, pointerEvents: "none",
          animation: "heartPop 0.85s ease-out forwards",
        }}>❤️</div>
      )}

      {/* Bottom-left info */}
      <div style={{ position: "absolute", bottom: 28, left: 14, right: 70, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "white", fontWeight: 800, fontSize: 15.5, fontFamily: TT, letterSpacing: "-0.01em", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
            {video.user}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setFollowed(f => !f); }}
            style={{
              padding: "4px 13px", borderRadius: 4,
              border: "1.5px solid white",
              background: followed ? "rgba(255,255,255,0.15)" : "transparent",
              color: "white",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              fontFamily: TT, letterSpacing: "0.01em",
            }}
          >
            {followed ? "Abonné ✓" : "+ Suivre"}
          </button>
        </div>

        <p style={{
          color: "rgba(255,255,255,0.96)", fontSize: 13.5, lineHeight: 1.45,
          margin: 0, fontFamily: TT, fontWeight: 400,
          textShadow: "0 1px 3px rgba(0,0,0,0.75)",
        }}>
          {video.desc}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="white" style={{ flexShrink: 0 }}>
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
          <span style={{ color: "rgba(255,255,255,0.88)", fontSize: 12.5, fontFamily: TT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {video.audio}
          </span>
        </div>
      </div>

      {/* Right-side actions */}
      <div style={{
        position: "absolute", right: 10, bottom: 110,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 22,
      }}>
        {/* Avatar with + */}
        <div style={{ position: "relative", marginBottom: 6 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "2px solid white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "white", fontFamily: TT,
          }}>
            {video.avatar}
          </div>
          <div style={{
            position: "absolute", bottom: -9, left: "50%", transform: "translateX(-50%)",
            width: 20, height: 20, borderRadius: "50%",
            background: "#fe2c55",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 900, color: "white", lineHeight: 1,
            border: "2px solid #000",
          }}>+</div>
        </div>

        <ActionBtn
          icon={<HeartIcon filled={liked} />}
          label={fmt(likeCount)}
          color={liked ? "#fe2c55" : "white"}
          onClick={e => { e.stopPropagation(); setLiked(l => !l); setLikeCount(c => liked ? c - 1 : c + 1); }}
        />
        <ActionBtn icon={<CommentIcon />} label={fmt(video.comments)} onClick={e => e.stopPropagation()} />
        <ActionBtn
          icon={<BookmarkIcon filled={saved} />}
          label={fmt(video.favs)}
          color={saved ? "#ffe033" : "white"}
          onClick={e => { e.stopPropagation(); setSaved(s => !s); }}
        />
        <ActionBtn icon={<ShareIcon />} label={fmt(video.shares)} onClick={e => e.stopPropagation()} />

        {/* Spinning disc */}
        <div style={{
          width: 46, height: 46, borderRadius: "50%",
          background: "linear-gradient(135deg, #2a2a2a 0%, #0f0f0f 100%)",
          border: "3.5px solid rgba(255,255,255,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: active ? "spin 4s linear infinite" : "none",
          boxShadow: "0 0 0 8px rgba(255,255,255,0.05)",
          marginTop: 2,
        }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "white" }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let t;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => setActiveIdx(Math.round(el.scrollTop / el.clientHeight)), 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes heartPop {
          0%   { transform: translate(-50%,-50%) scale(0.15); opacity: 1; }
          55%  { transform: translate(-50%,-50%) scale(1.3); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1.1); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .snap-wrap {
          overflow-y: scroll;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          height: 100%;
        }
        .snap-wrap::-webkit-scrollbar { display: none; }
        .snap-item {
          scroll-snap-align: start;
          width: 100%;
          height: 100%;
          flex-shrink: 0;
        }
      `}</style>

      <div style={{
        width: "100%",
        height: "calc(100vh - 24px)",
        minHeight: 600,
        maxWidth: 400,
        margin: "0 auto",
        background: "#000",
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
        boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
      }}>

        {/* Header — "Fil d'actualité : Pour toi" only */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 200,
          paddingTop: 16, paddingBottom: 14,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)",
          pointerEvents: "none",
        }}>
          <span style={{
            color: "rgba(255,255,255,0.48)",
            fontSize: 10.5,
            fontFamily: TT,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Fil d'actualité :
          </span>
          <span style={{
            color: "white",
            fontSize: 17,
            fontFamily: TT,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}>
            Pour toi
          </span>
          <div style={{ width: 26, height: 2.5, background: "white", borderRadius: 2, marginTop: 2 }} />
        </div>

        {/* Video feed */}
        <div ref={containerRef} className="snap-wrap">
          {videos.map((video, i) => (
            <div key={video.id} className="snap-item">
              <VideoCard video={video} active={i === activeIdx} />
            </div>
          ))}
        </div>

        {/* Progress dots */}
        <div style={{
          position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
          display: "flex", flexDirection: "column", gap: 5,
          zIndex: 199, pointerEvents: "none",
        }}>
          {videos.map((_, i) => (
            <div key={i} style={{
              width: 3,
              height: i === activeIdx ? 20 : 6,
              borderRadius: 3,
              background: i === activeIdx ? "white" : "rgba(255,255,255,0.25)",
              transition: "all 0.25s cubic-bezier(.4,0,.2,1)",
            }} />
          ))}
        </div>
      </div>
    </>
  );
}
