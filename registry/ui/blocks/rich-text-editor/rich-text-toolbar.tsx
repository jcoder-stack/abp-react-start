import { useLocalization } from "@jcoder-stack/abp-react/react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  ImagePlusIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  MinusIcon,
  PaletteIcon,
  QuoteIcon,
  Redo2Icon,
  SquareCodeIcon,
  StrikethroughIcon,
  TableIcon,
  UnderlineIcon,
  Undo2Icon,
  UnlinkIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type CSSProperties,
  Fragment,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { IMAGE_MIME_TYPES, insertUploadedImage, type UploadImage } from "./extensions";
import { RICH_TEXT_PALETTE, type RichTextPaletteColor } from "./palette";

/** 工具栏按钮；`"|"` 是分组分隔线。顺序即渲染顺序。 */
export type RichTextToolbarItem =
  | "undo"
  | "redo"
  | "heading"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "color"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "link"
  | "image"
  | "table"
  | "|";

export const DEFAULT_TOOLBAR: RichTextToolbarItem[] = [
  "undo",
  "redo",
  "|",
  "heading",
  "|",
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "color",
  "|",
  "bulletList",
  "orderedList",
  "taskList",
  "|",
  "blockquote",
  "codeBlock",
  "table",
  "horizontalRule",
  "|",
  "link",
  "image",
];

/** 选区气泡菜单的默认按钮：只放作用于选中文字的行内格式。 */
export const DEFAULT_BUBBLE_ITEMS: RichTextToolbarItem[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "color",
  "link",
];

const HEADING_LEVELS = [1, 2, 3] as const;

function selectToolbarState({ editor }: { editor: Editor }) {
  return {
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    heading: HEADING_LEVELS.find((level) => editor.isActive("heading", { level })) ?? 0,
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    color: (editor.getAttributes("textStyle").color as RichTextPaletteColor | undefined) ?? null,
    highlight:
      (editor.getAttributes("highlight").color as RichTextPaletteColor | undefined) ?? null,
    highlighted: editor.isActive("highlight"),
    bulletList: editor.isActive("bulletList"),
    orderedList: editor.isActive("orderedList"),
    taskList: editor.isActive("taskList"),
    blockquote: editor.isActive("blockquote"),
    codeBlock: editor.isActive("codeBlock"),
    link: editor.isActive("link"),
    href: (editor.getAttributes("link").href as string | undefined) ?? "",
    inTable: editor.isActive("table"),
  };
}

type ToolbarState = ReturnType<typeof selectToolbarState>;

export interface RichTextToolbarProps extends Omit<ComponentProps<"div">, "children"> {
  editor: Editor;
  items?: RichTextToolbarItem[];
  uploadImage?: UploadImage;
  onUploadError?: (error: unknown, file: File) => void;
}

/** 编辑器工具栏，也被选区气泡菜单复用（换一组 `items`）。按钮的激活态订阅自编辑器状态。 */
export function RichTextToolbar({
  editor,
  items = DEFAULT_TOOLBAR,
  uploadImage,
  onUploadError,
  className,
  ...props
}: RichTextToolbarProps) {
  const L = useLocalization();
  const state = useEditorState({ editor, selector: selectToolbarState });
  const disabled = !editor.isEditable;
  const visible = items.filter((item) => item !== "image" || uploadImage);

  return (
    <div
      role="toolbar"
      aria-label={L("RichText:Toolbar")}
      className={cn("flex flex-wrap items-center gap-0.5", className)}
      {...props}
    >
      {visible.map((item, index) => {
        // 分隔线没有身份，用「前一个按钮名」作 key：配置里同一按钮不会出现两次。
        const key = item === "|" ? `|${visible[index - 1] ?? "start"}` : item;
        return (
          <Fragment key={key}>
            {item === "|" ? (
              <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            ) : (
              <ToolbarControl
                item={item}
                editor={editor}
                state={state}
                disabled={disabled}
                uploadImage={uploadImage}
                onUploadError={onUploadError}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

interface ToolbarControlProps {
  item: Exclude<RichTextToolbarItem, "|">;
  editor: Editor;
  state: ToolbarState;
  disabled: boolean;
  uploadImage?: UploadImage;
  onUploadError?: (error: unknown, file: File) => void;
}

function ToolbarControl({
  item,
  editor,
  state,
  disabled,
  uploadImage,
  onUploadError,
}: ToolbarControlProps) {
  const L = useLocalization();
  const chain = () => editor.chain().focus();

  switch (item) {
    case "undo":
      return (
        <ToolbarButton
          label={L("RichText:Undo")}
          disabled={disabled || !state.canUndo}
          onClick={() => chain().undo().run()}
        >
          <Undo2Icon />
        </ToolbarButton>
      );
    case "redo":
      return (
        <ToolbarButton
          label={L("RichText:Redo")}
          disabled={disabled || !state.canRedo}
          onClick={() => chain().redo().run()}
        >
          <Redo2Icon />
        </ToolbarButton>
      );
    case "heading":
      return <HeadingMenu editor={editor} level={state.heading} disabled={disabled} />;
    case "bold":
      return (
        <ToolbarToggle
          label={L("RichText:Bold")}
          pressed={state.bold}
          disabled={disabled}
          onClick={() => chain().toggleBold().run()}
        >
          <BoldIcon />
        </ToolbarToggle>
      );
    case "italic":
      return (
        <ToolbarToggle
          label={L("RichText:Italic")}
          pressed={state.italic}
          disabled={disabled}
          onClick={() => chain().toggleItalic().run()}
        >
          <ItalicIcon />
        </ToolbarToggle>
      );
    case "underline":
      return (
        <ToolbarToggle
          label={L("RichText:Underline")}
          pressed={state.underline}
          disabled={disabled}
          onClick={() => chain().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolbarToggle>
      );
    case "strike":
      return (
        <ToolbarToggle
          label={L("RichText:Strike")}
          pressed={state.strike}
          disabled={disabled}
          onClick={() => chain().toggleStrike().run()}
        >
          <StrikethroughIcon />
        </ToolbarToggle>
      );
    case "code":
      return (
        <ToolbarToggle
          label={L("RichText:Code")}
          pressed={state.code}
          disabled={disabled}
          onClick={() => chain().toggleCode().run()}
        >
          <CodeIcon />
        </ToolbarToggle>
      );
    case "color":
      return <ColorMenu editor={editor} state={state} disabled={disabled} />;
    case "bulletList":
      return (
        <ToolbarToggle
          label={L("RichText:BulletList")}
          pressed={state.bulletList}
          disabled={disabled}
          onClick={() => chain().toggleBulletList().run()}
        >
          <ListIcon />
        </ToolbarToggle>
      );
    case "orderedList":
      return (
        <ToolbarToggle
          label={L("RichText:OrderedList")}
          pressed={state.orderedList}
          disabled={disabled}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </ToolbarToggle>
      );
    case "taskList":
      return (
        <ToolbarToggle
          label={L("RichText:TaskList")}
          pressed={state.taskList}
          disabled={disabled}
          onClick={() => chain().toggleTaskList().run()}
        >
          <ListTodoIcon />
        </ToolbarToggle>
      );
    case "blockquote":
      return (
        <ToolbarToggle
          label={L("RichText:Blockquote")}
          pressed={state.blockquote}
          disabled={disabled}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <QuoteIcon />
        </ToolbarToggle>
      );
    case "codeBlock":
      return (
        <ToolbarToggle
          label={L("RichText:CodeBlock")}
          pressed={state.codeBlock}
          disabled={disabled}
          onClick={() => chain().toggleCodeBlock().run()}
        >
          <SquareCodeIcon />
        </ToolbarToggle>
      );
    case "horizontalRule":
      return (
        <ToolbarButton
          label={L("RichText:HorizontalRule")}
          disabled={disabled}
          onClick={() => chain().setHorizontalRule().run()}
        >
          <MinusIcon />
        </ToolbarButton>
      );
    case "link":
      return <LinkPopover editor={editor} state={state} disabled={disabled} />;
    case "image":
      return uploadImage ? (
        <ImageButton
          editor={editor}
          disabled={disabled}
          uploadImage={uploadImage}
          onUploadError={onUploadError}
        />
      ) : null;
    case "table":
      return <TableMenu editor={editor} inTable={state.inTable} disabled={disabled} />;
  }
}

interface ToolbarButtonProps extends ComponentProps<typeof Button> {
  label: string;
  children: ReactNode;
}

/** 图标按钮 + tooltip。aria-label 承载可访问名称，tooltip 只给视觉用户。 */
function ToolbarButton({ label, children, className, ...props }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          // 按下不抢焦点：否则选区在点击前就丢了，格式命令作用不到选中的文字上。
          onMouseDown={(event) => event.preventDefault()}
          className={cn("aria-pressed:bg-accent aria-pressed:text-accent-foreground", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarToggle({ pressed, ...props }: ToolbarButtonProps & { pressed: boolean }) {
  return <ToolbarButton aria-pressed={pressed} {...props} />;
}

function HeadingMenu({
  editor,
  level,
  disabled,
}: {
  editor: Editor;
  level: number;
  disabled: boolean;
}) {
  const L = useLocalization();
  const current = level === 0 ? L("RichText:Paragraph") : L("RichText:Heading", level);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={L("RichText:TextStyle")}
          className="min-w-20 justify-between"
        >
          {current}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem onSelect={() => editor.chain().focus().setParagraph().run()}>
          <MenuCheck checked={level === 0} />
          {L("RichText:Paragraph")}
        </DropdownMenuItem>
        {HEADING_LEVELS.map((headingLevel) => (
          <DropdownMenuItem
            key={headingLevel}
            onSelect={() => editor.chain().focus().setHeading({ level: headingLevel }).run()}
          >
            <MenuCheck checked={level === headingLevel} />
            {L("RichText:Heading", headingLevel)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuCheck({ checked }: { checked: boolean }) {
  return <CheckIcon className={cn("size-4", !checked && "invisible")} aria-hidden />;
}

/** 色块的颜色来自色板令牌；inline style 只引用 CSS 变量，不写色值。 */
function Swatch({
  label,
  selected,
  onSelect,
  children,
  style,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      style={style}
      className="flex size-7 items-center justify-center rounded-md border border-border text-sm font-medium outline-none hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground"
    >
      {children}
    </button>
  );
}

function ColorMenu({
  editor,
  state,
  disabled,
}: {
  editor: Editor;
  state: ToolbarState;
  disabled: boolean;
}) {
  const L = useLocalization();
  const colorName = (name: RichTextPaletteColor) => L(`RichText:Color.${name}`);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={L("RichText:Color")}
              onMouseDown={(event) => event.preventDefault()}
            >
              <PaletteIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{L("RichText:Color")}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-auto space-y-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-muted-foreground">{L("RichText:TextColor")}</legend>
          <div className="grid grid-cols-9 gap-1">
            <Swatch
              label={L("RichText:DefaultColor")}
              selected={state.color === null}
              onSelect={() => editor.chain().focus().unsetColor().run()}
            >
              A
            </Swatch>
            {RICH_TEXT_PALETTE.map((name) => (
              <Swatch
                key={name}
                label={colorName(name)}
                selected={state.color === name}
                onSelect={() => editor.chain().focus().setColor(name).run()}
                style={{ color: `var(--rte-text-${name})` }}
              >
                A
              </Swatch>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="text-xs text-muted-foreground">{L("RichText:HighlightColor")}</legend>
          <div className="grid grid-cols-9 gap-1">
            <Swatch
              label={L("RichText:NoHighlight")}
              selected={!state.highlighted}
              onSelect={() => editor.chain().focus().unsetHighlight().run()}
            >
              <MinusIcon className="size-3.5" aria-hidden />
            </Swatch>
            {RICH_TEXT_PALETTE.map((name) => (
              <Swatch
                key={name}
                label={colorName(name)}
                selected={state.highlight === name}
                onSelect={() => editor.chain().focus().setHighlight({ color: name }).run()}
                style={{ backgroundColor: `var(--rte-highlight-${name})` }}
              >
                {null}
              </Swatch>
            ))}
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

/** 用户常省略协议直接贴 `example.com`；其余协议（含 javascript:）交给 Link 扩展的 isAllowedUri 拦截。 */
function normalizeHref(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "" || /^[a-z][a-z\d+.-]*:/i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function LinkPopover({
  editor,
  state,
  disabled,
}: {
  editor: Editor;
  state: ToolbarState;
  disabled: boolean;
}) {
  const L = useLocalization();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");

  const apply = () => {
    const next = normalizeHref(href);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (next === "") chain.unsetLink().run();
    else chain.setLink({ href: next }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setHref(state.href);
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={L("RichText:Link")}
              aria-pressed={state.link}
              onMouseDown={(event) => event.preventDefault()}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              <LinkIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{L("RichText:Link")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {L("RichText:LinkUrl")}
          </label>
          <Input
            id={inputId}
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://"
            inputMode="url"
            autoComplete="off"
          />
          <Button type="submit" size="sm">
            {L("RichText:LinkApply")}
          </Button>
          {state.link && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={L("RichText:LinkRemove")}
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
            >
              <UnlinkIcon />
            </Button>
          )}
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ImageButton({
  editor,
  disabled,
  uploadImage,
  onUploadError,
}: {
  editor: Editor;
  disabled: boolean;
  uploadImage: UploadImage;
  onUploadError?: (error: unknown, file: File) => void;
}) {
  const L = useLocalization();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <ToolbarButton
        label={L("RichText:Image")}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlusIcon />
      </ToolbarButton>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_MIME_TYPES.join(",")}
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          for (const file of files)
            insertUploadedImage(editor, file, uploadImage, undefined, onUploadError);
        }}
      />
    </>
  );
}

function TableMenu({
  editor,
  inTable,
  disabled,
}: {
  editor: Editor;
  inTable: boolean;
  disabled: boolean;
}) {
  const L = useLocalization();
  const chain = () => editor.chain().focus();
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={L("RichText:Table")}
              aria-pressed={inTable}
              className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              <TableIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{L("RichText:Table")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem
          disabled={inTable}
          onSelect={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          {L("RichText:InsertTable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!inTable} onSelect={() => chain().addRowBefore().run()}>
          {L("RichText:AddRowBefore")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => chain().addRowAfter().run()}>
          {L("RichText:AddRowAfter")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => chain().addColumnBefore().run()}>
          {L("RichText:AddColumnBefore")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => chain().addColumnAfter().run()}>
          {L("RichText:AddColumnAfter")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inTable} onSelect={() => chain().toggleHeaderRow().run()}>
          {L("RichText:ToggleHeaderRow")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={!inTable}
          onSelect={() => chain().deleteRow().run()}
        >
          {L("RichText:DeleteRow")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!inTable}
          onSelect={() => chain().deleteColumn().run()}
        >
          {L("RichText:DeleteColumn")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          disabled={!inTable}
          onSelect={() => chain().deleteTable().run()}
        >
          {L("RichText:DeleteTable")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
