import QtQuick
import QtQuick.Layouts
import qs.Commons

// ARCH node map. Snapshot-only: nodes/edges arrive on `arch`. No helper
// process, no network. Click emits the seat-1 thinkFilter id.
Item {
  id: root
  property var desk: null
  property var arch: ({})
  property string thinkFilter: ""
  signal nodeClicked(string id)

  component PlainText: Text { textFormat: Text.PlainText }

  readonly property var nodes: Array.isArray(root.arch && root.arch.nodes) ? root.arch.nodes.slice(0, 24) : []
  readonly property var edges: Array.isArray(root.arch && root.arch.edges) ? root.arch.edges.slice(0, 16) : []
  readonly property color fg: root.desk && root.desk.themeForeground ? root.desk.themeForeground : Color.foreground
  readonly property color bg: root.desk && root.desk.themeBackground ? root.desk.themeBackground : Color.background
  readonly property color cyan: root.desk && root.desk.cyan ? root.desk.cyan : Color.accent
  readonly property color red: root.desk && root.desk.red ? root.desk.red : Color.urgent
  readonly property color yellow: root.desk && root.desk.yellow ? root.desk.yellow : Color.foreground
  readonly property color green: root.desk && root.desk.green ? root.desk.green : Color.accent
  readonly property string mono: Style.resolvedFontFamily

  implicitHeight: Math.round(220 * Style.fontScale)

  function nodeTone(node) {
    var attention = String((node && node.attention) || "")
    if (attention === "blocked") return root.red
    if (attention === "waiting") return root.yellow
    if (attention === "done") return root.green
    return node && node.house ? root.cyan : root.fg
  }

  function nodeAt(id) {
    var list = root.nodes
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i]
    return null
  }

  Rectangle {
    anchors.fill: parent
    color: Util.alpha(root.bg, 0.62)
    border.color: Util.alpha(root.fg, 0.14)
    border.width: 1
    radius: Math.max(Style.cornerRadius, 0)

    ColumnLayout {
      anchors { fill: parent; margins: Style.spacing.lg }
      spacing: Style.spacing.sm

      RowLayout {
        Layout.fillWidth: true
        PlainText {
          text: "ARCH"
          color: Util.alpha(root.fg, 0.62)
          font.family: root.mono
          font.pixelSize: Style.font.caption
          font.letterSpacing: 1.5
          font.bold: true
        }
        Item { Layout.fillWidth: true }
        PlainText {
          text: root.thinkFilter !== "" ? "filtered · click a node or the chip to clear" : "click a node to filter sessions"
          color: Util.alpha(root.fg, 0.38)
          font.family: root.mono
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
          Layout.maximumWidth: Math.round(parent.width * 0.7)
        }
      }

      Item {
        id: map
        Layout.fillWidth: true
        Layout.fillHeight: true

        Canvas {
          id: edgeCanvas
          anchors.fill: parent
          Connections {
            target: root
            function onArchChanged() { edgeCanvas.requestPaint() }
            function onThinkFilterChanged() { edgeCanvas.requestPaint() }
          }
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()
          onPaint: {
            var ctx = getContext("2d")
            ctx.reset()
            var list = root.edges, w = width, h = height
            var stroke = root.fg
            ctx.strokeStyle = Qt.rgba(stroke.r, stroke.g, stroke.b, 0.28)
            ctx.lineWidth = 1.5
            for (var i = 0; i < list.length; i++) {
              var a = root.nodeAt(list[i].from), b = root.nodeAt(list[i].to)
              if (!a || !b) continue
              ctx.beginPath()
              ctx.moveTo(Number(a.x) * w, Number(a.y) * h)
              ctx.lineTo(Number(b.x) * w, Number(b.y) * h)
              ctx.stroke()
            }
          }
        }

        Repeater {
          model: root.edges
          delegate: PlainText {
            required property var modelData
            readonly property var fromNode: root.nodeAt(modelData.from)
            readonly property var toNode: root.nodeAt(modelData.to)
            visible: !!(fromNode && toNode && modelData.label)
            x: fromNode && toNode ? (Number(fromNode.x) + Number(toNode.x)) * 0.5 * map.width - width / 2 : 0
            y: fromNode && toNode ? (Number(fromNode.y) + Number(toNode.y)) * 0.5 * map.height - height / 2 : 0
            text: String((modelData && modelData.label) || "")
            color: Util.alpha(root.fg, 0.38)
            font.family: root.mono
            font.pixelSize: Style.font.caption
          }
        }

        Repeater {
          model: root.nodes
          delegate: Rectangle {
            id: nodeBox
            required property var modelData
            readonly property color tone: root.nodeTone(modelData)
            readonly property bool selected: root.thinkFilter !== "" && root.thinkFilter === String(modelData.thinkFilter || "")
            width: Math.max(Math.round(92 * Style.fontScale), nodeCol.implicitWidth + Style.spacing.md * 2)
            height: nodeCol.implicitHeight + Style.spacing.xs * 2
            x: Number(modelData.x) * map.width - width / 2
            y: Number(modelData.y) * map.height - height / 2
            radius: Math.max(Style.cornerRadius, 0)
            color: Util.alpha(nodeBox.tone, nodeHover.containsMouse || nodeBox.selected ? 0.20 : 0.08)
            border.color: Util.alpha(nodeBox.tone, nodeBox.selected ? 0.95 : nodeHover.containsMouse ? 0.8 : 0.45)
            border.width: nodeBox.selected ? 2 : 1
            ColumnLayout {
              id: nodeCol
              anchors.centerIn: parent
              spacing: 0
              PlainText {
                text: String((nodeBox.modelData && nodeBox.modelData.label) || "")
                color: root.fg
                font.family: root.mono
                font.pixelSize: Style.font.bodySmall
                font.bold: true
                elide: Text.ElideRight
                Layout.maximumWidth: Math.round(140 * Style.fontScale)
              }
              PlainText {
                text: String((nodeBox.modelData && nodeBox.modelData.role) || "") + (Number(nodeBox.modelData.sessions) > 0 ? " · " + Number(nodeBox.modelData.sessions) : "")
                color: Number(nodeBox.modelData.sessions) > 0 ? nodeBox.tone : Util.alpha(root.fg, 0.38)
                font.family: root.mono
                font.pixelSize: Style.font.caption
                elide: Text.ElideRight
                Layout.maximumWidth: Math.round(140 * Style.fontScale)
              }
            }
            MouseArea {
              id: nodeHover
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: {
                var id = String((nodeBox.modelData && nodeBox.modelData.thinkFilter) || (nodeBox.modelData && nodeBox.modelData.id) || "")
                if (id) root.nodeClicked(id)
              }
            }
          }
        }
      }
    }
  }
}
