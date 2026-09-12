import QtQuick
import QtQuick.Layouts
import qs.Commons

// Per-repo 7-day bars. Loaded from InfoView behind section id githubRepos so a
// missing file cannot take the desk down. Click sets thinkFilter when the
// glass seat shipped it, otherwise projectFilter.
Rectangle {
  id: root
  property var host: null
  readonly property bool ready: !!(host && host.desk)
  readonly property var desk: ready ? host.desk : ({})
  readonly property var pack: (host && host.ai && host.ai.githubRepos) ? host.ai.githubRepos : ({})
  readonly property var repos: pack.repos || []
  readonly property int pad: Style.spacing.xl
  readonly property color textDim: ready ? Util.alpha(desk.themeForeground, 0.62) : "transparent"
  readonly property color textFaint: ready ? Util.alpha(desk.themeForeground, 0.38) : "transparent"
  width: parent ? parent.width : 400
  implicitHeight: ready ? col.implicitHeight + pad * 2 : 0
  visible: ready
  color: ready ? Util.alpha(desk.themeBackground, 0.62) : "transparent"
  border.color: ready ? Util.alpha(desk.themeForeground, 0.14) : "transparent"
  border.width: 1
  radius: Math.max(Style.cornerRadius, 0)

  function filterValue() {
    if (!host) return ""
    if (host.thinkFilter !== undefined) return String(host.thinkFilter || "")
    return String(host.projectFilter || "")
  }
  function setFilter(name) {
    if (!host || !name) return
    var next = filterValue() === name ? "" : name
    if (host.thinkFilter !== undefined) host.thinkFilter = next
    else host.projectFilter = next
  }

  MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onClicked: function(m) { m.accepted = true } }

  ColumnLayout {
    id: col
    anchors { fill: parent; margins: root.pad }
    spacing: Style.spacing.md
    RowLayout {
      Layout.fillWidth: true
      Text {
        text: "REPOS · LAST 7 DAYS"
        textFormat: Text.PlainText
        color: root.textDim
        font.family: Style.resolvedFontFamily
        font.pixelSize: Style.font.caption
        font.letterSpacing: 1.5
        font.bold: true
      }
      Item { Layout.fillWidth: true }
      Text {
        text: root.repos.length ? root.repos.length + " repos · click to filter" : ""
        textFormat: Text.PlainText
        color: root.textFaint
        font.family: Style.resolvedFontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
        Layout.maximumWidth: implicitWidth
        Layout.fillWidth: true
        Layout.minimumWidth: 0
        horizontalAlignment: Text.AlignRight
      }
    }
    Repeater {
      model: root.repos
      delegate: Rectangle {
        id: repoRow
        required property var modelData
        readonly property var points: Array.isArray(modelData.points) ? modelData.points : []
        readonly property real peak: {
          var max = 1
          for (var i = 0; i < points.length; i++) max = Math.max(max, Number(points[i]) || 0)
          return max
        }
        readonly property bool selected: root.filterValue() === String(modelData.name || "")
        readonly property color tone: selected ? root.desk.cyan : root.desk.green
        Layout.fillWidth: true
        implicitHeight: Math.round(28 * Style.fontScale)
        radius: root.radius
        color: Util.alpha(tone, repoHover.hovered || selected ? 0.15 : 0.06)
        border.color: Util.alpha(tone, selected ? 0.85 : 0.35)
        border.width: selected ? 2 : 1
        RowLayout {
          anchors { fill: parent; leftMargin: Style.spacing.sm; rightMargin: Style.spacing.sm }
          spacing: Style.spacing.sm
          Text {
            text: String(repoRow.modelData.name || "")
            textFormat: Text.PlainText
            color: root.desk.themeForeground
            font.family: Style.resolvedFontFamily
            font.pixelSize: Style.font.bodySmall
            font.bold: true
            elide: Text.ElideMiddle
            Layout.preferredWidth: Math.round(120 * Style.fontScale)
            Layout.maximumWidth: Math.round(160 * Style.fontScale)
          }
          Item {
            Layout.fillWidth: true
            Layout.preferredHeight: Math.round(16 * Style.fontScale)
            Row {
              id: spark
              anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
              spacing: Math.max(1, Math.round(2 * Style.fontScale))
              Repeater {
                model: 7
                delegate: Item {
                  required property int index
                  width: Math.max(3, Math.round(6 * Style.fontScale))
                  height: spark.height
                  Rectangle {
                    width: parent.width
                    height: Math.max(2, Math.round((Number(repoRow.points[index]) || 0) / repoRow.peak * parent.height))
                    anchors.bottom: parent.bottom
                    radius: 1
                    color: repoRow.tone
                    opacity: (Number(repoRow.points[index]) || 0) > 0 ? 1 : 0.25
                  }
                }
              }
            }
          }
          Text {
            text: Number(repoRow.modelData.commits7 || 0) + "c · " + Number(repoRow.modelData.prs7 || 0) + "p"
            textFormat: Text.PlainText
            color: root.textDim
            font.family: Style.resolvedFontFamily
            font.pixelSize: Style.font.caption
            Layout.alignment: Qt.AlignVCenter
          }
        }
        HoverHandler { id: repoHover; enabled: !!(root.host && root.host.interactive); cursorShape: Qt.PointingHandCursor }
        TapHandler { enabled: !!(root.host && root.host.interactive); onTapped: root.setFilter(String(repoRow.modelData.name || "")) }
      }
    }
    Text {
      visible: root.repos.length === 0
      text: "no GitHub repo activity in the last 7 days"
      textFormat: Text.PlainText
      color: root.textFaint
      font.family: Style.resolvedFontFamily
      font.pixelSize: Style.font.bodySmall
    }
  }
}
