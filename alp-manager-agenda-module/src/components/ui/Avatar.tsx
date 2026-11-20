import type { AgendaUser } from "@/lib/agenda-types";

export function Avatar({
  user,
  size = 28,
  className = "",
  title,
}: {
  user: Pick<AgendaUser, "name" | "initials" | "color"> | null | undefined;
  size?: number;
  className?: string;
  title?: string;
}) {
  if (!user) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 text-[10px] text-alp-dim ${className}`}
        style={{ width: size, height: size }}
        title="Non attribué"
      >
        —
      </span>
    );
  }
  return (
    <span
      title={title ?? user.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.36),
        color: "#06100a",
        background: `linear-gradient(150deg, ${user.color} 0%, ${user.color}b0 100%)`,
        boxShadow: `0 0 0 1px ${user.color}55`,
      }}
    >
      {user.initials}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 4,
  size = 24,
}: {
  users: AgendaUser[];
  max?: number;
  size?: number;
}) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((user, index) => (
        <span
          key={user.id}
          className="rounded-full ring-2 ring-[#0b1011]"
          style={{ marginLeft: index === 0 ? 0 : -size * 0.35 }}
        >
          <Avatar user={user} size={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-white/10 font-medium text-white/70 ring-2 ring-[#0b1011]"
          style={{ width: size, height: size, fontSize: size * 0.36, marginLeft: -size * 0.35 }}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
