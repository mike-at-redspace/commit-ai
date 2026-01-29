import React from "react";
import { Text } from "ink";

interface SelectItemProps {
  isSelected?: boolean;
  label: string;
}

/**
 * Select list item that shows the selected choice in green.
 * Used as itemComponent for ink-select-input.
 */
export function SelectItem({ isSelected = false, label }: SelectItemProps) {
  return <Text color={isSelected ? "green" : undefined}>{label}</Text>;
}
