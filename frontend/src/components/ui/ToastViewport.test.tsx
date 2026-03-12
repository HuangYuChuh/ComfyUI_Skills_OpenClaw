import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastViewport } from "./ToastViewport";

describe("ToastViewport", () => {
  it("pauses auto-dismiss while hovered and resumes after leave", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ToastViewport
        toasts={[{ id: "toast-1", type: "success", message: "Saved" }]}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByText("Saved").closest(".toast");
    expect(toast).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.mouseEnter(toast!);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast!);
    act(() => {
      vi.advanceTimersByTime(1199);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(261);
    });
    expect(onDismiss).toHaveBeenCalledWith("toast-1");
    vi.useRealTimers();
  });

  it("applies the closing state before dismissing", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ToastViewport
        toasts={[{ id: "toast-2", type: "info", message: "Heads up" }]}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByText("Heads up").closest(".toast") as HTMLElement;
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    });
    expect(toast).toHaveClass("closing");
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(onDismiss).toHaveBeenCalledWith("toast-2");
    vi.useRealTimers();
  });
});
