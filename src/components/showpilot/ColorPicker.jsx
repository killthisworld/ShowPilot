import React, { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESET_COLORS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E", "#8CFF3D",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
  "#F43F5E", "#14B8A6", "#84CC16", "#A855F7", "#D946EF",
  "#FB923C", "#FBBF24", "#34D399", "#60A5FA", "#C084FC",
];

const RECENT_KEY = "showpilot_recent_colors";
const MAX_RECENT = 8;

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function addRecent(color) {
  const prev = getRecent().filter(c => c !== color);
  const next = [color, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function ColorPicker({ value, onChange, label }) {
  const [customColor, setCustomColor] = useState(value || "#8CFF3D");
  const [open, setOpen] = useState(false);
  const [recentColors, setRecentColors] = useState([]);

  useEffect(() => {
    if (open) setRecentColors(getRecent());
  }, [open]);

  const pick = (color) => {
    addRecent(color);
    onChange(color);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 h-9 px-3 bg-[#1a1a1a] border-[#2a2a2a] hover:bg-[#222]">
          <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: value || "#666" }} />
          <span className="text-sm text-white/70">{label || "Color"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-[#1a1a1a] border-[#2a2a2a] p-3" align="start">
        <div className="space-y-3">
          {recentColors.length > 0 && (
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-2">Recently Used</p>
              <div className="flex gap-1.5 flex-wrap">
                {recentColors.map((c) => (
                  <button
                    key={c}
                    className="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110"
                    style={{ backgroundColor: c, borderColor: value === c ? "white" : "transparent" }}
                    onClick={() => pick(c)}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-2">Presets</p>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className="w-8 h-8 rounded-lg border-2 transition-all hover:scale-110"
                  style={{ backgroundColor: c, borderColor: value === c ? "white" : "transparent" }}
                  onClick={() => pick(c)}
                />
              ))}
            </div>
          </div>
          <div className="border-t border-[#2a2a2a] pt-3">
            <p className="text-xs text-white/50 uppercase tracking-wider font-medium mb-2">Custom</p>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
              />
              <Input
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="flex-1 h-9 bg-[#111] border-[#2a2a2a] text-white text-sm font-mono"
                placeholder="#000000"
              />
              <Button size="sm" className="bg-[#8CFF3D] text-black hover:bg-[#7ae62e] h-9" onClick={() => pick(customColor)}>
                Set
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
